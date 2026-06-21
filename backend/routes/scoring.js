const express = require('express');
const pool = require('../db');
const { requireLeagueAdmin } = require('../middleware/league');

// mergeParams: true para poder leer :id (la liga) montado desde leagues.js
const router = express.Router({ mergeParams: true });

function validatePayload(body) {
  const { name, emoji, points } = body;
  if (!name || !name.trim()) return 'El nombre del elemento es obligatorio.';
  if (!emoji || !emoji.trim()) return 'Elige un emoji para el elemento.';
  if (points === undefined || points === null || Number.isNaN(Number(points))) {
    return 'Los puntos deben ser un número.';
  }
  return null;
}

// Listar el sistema de puntuación de la liga. Cualquier miembro puede verlo.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, emoji, points FROM scoring_items WHERE league_id = $1 ORDER BY points DESC, name ASC',
      [req.league.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Añadir un elemento de puntuación. Solo el admin de la liga.
router.post('/', requireLeagueAdmin, async (req, res, next) => {
  try {
    const error = validatePayload(req.body);
    if (error) return res.status(400).json({ error });

    const { name, emoji, points } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO scoring_items (league_id, name, emoji, points)
       VALUES ($1, $2, $3, $4) RETURNING id, name, emoji, points`,
      [req.league.id, name.trim(), emoji.trim(), Math.trunc(Number(points))]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un elemento con ese nombre en esta liga.' });
    }
    next(err);
  }
});

// Editar un elemento de puntuación. Solo el admin de la liga.
router.put('/:itemId', requireLeagueAdmin, async (req, res, next) => {
  try {
    const error = validatePayload(req.body);
    if (error) return res.status(400).json({ error });

    const { name, emoji, points } = req.body;
    const { rows } = await pool.query(
      `UPDATE scoring_items SET name = $1, emoji = $2, points = $3
       WHERE id = $4 AND league_id = $5
       RETURNING id, name, emoji, points`,
      [name.trim(), emoji.trim(), Math.trunc(Number(points)), req.params.itemId, req.league.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Elemento no encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un elemento con ese nombre en esta liga.' });
    }
    next(err);
  }
});

// Eliminar un elemento de puntuación. Solo el admin de la liga.
// Al eliminarlo se eliminan en cascada los registros del historial que lo usaban.
router.delete('/:itemId', requireLeagueAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM scoring_items WHERE id = $1 AND league_id = $2',
      [req.params.itemId, req.league.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Elemento no encontrado.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
