const express = require('express');
const pool = require('../db');

// mergeParams: true para poder leer :id (la liga) montado desde leagues.js
const router = express.Router({ mergeParams: true });

const SELECT_BASE = `
  SELECT e.id, e.quantity, e.created_at, e.updated_at,
         u.id AS user_id, u.full_name, u.username,
         si.id AS scoring_item_id, si.name AS item_name, si.emoji AS item_emoji, si.points AS item_points
  FROM entries e
  JOIN users u ON u.id = e.user_id
  JOIN scoring_items si ON si.id = e.scoring_item_id
`;

function shapeRow(row) {
  return {
    id: row.id,
    quantity: row.quantity,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: { id: row.user_id, full_name: row.full_name, username: row.username },
    scoring_item: { id: row.scoring_item_id, name: row.item_name, emoji: row.item_emoji, points: row.item_points },
  };
}

// Historial de la liga, ordenado por más reciente. Filtrable por ?user_id=
router.get('/', async (req, res, next) => {
  try {
    const params = [req.league.id];
    let where = 'WHERE e.league_id = $1';

    if (req.query.user_id) {
      params.push(req.query.user_id);
      where += ` AND e.user_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `${SELECT_BASE} ${where} ORDER BY e.created_at DESC`,
      params
    );
    res.json(rows.map(shapeRow));
  } catch (err) {
    next(err);
  }
});

// Añadir una adición al historial (la registra el usuario autenticado).
router.post('/', async (req, res, next) => {
  try {
    const { scoring_item_id, quantity = 1 } = req.body;
    const qty = Math.trunc(Number(quantity));

    if (!scoring_item_id) {
      return res.status(400).json({ error: 'Selecciona un elemento.' });
    }
    if (!qty || qty <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser un número mayor que 0.' });
    }

    const itemCheck = await pool.query(
      'SELECT id FROM scoring_items WHERE id = $1 AND league_id = $2',
      [scoring_item_id, req.league.id]
    );
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ese elemento no pertenece a esta liga.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO entries (league_id, user_id, scoring_item_id, quantity)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.league.id, req.user.id, scoring_item_id, qty]
    );

    const { rows: fullRows } = await pool.query(`${SELECT_BASE} WHERE e.id = $1`, [rows[0].id]);
    res.status(201).json(shapeRow(fullRows[0]));
  } catch (err) {
    next(err);
  }
});

async function loadEntryWithPermissionCheck(req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM entries WHERE id = $1 AND league_id = $2',
    [req.params.entryId, req.league.id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Registro no encontrado.' });
    return null;
  }
  const entry = rows[0];
  const isOwner = entry.user_id === req.user.id;
  const isAdmin = req.league.creator_id === req.user.id;
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: 'Solo puedes editar o eliminar tus propios registros.' });
    return null;
  }
  return entry;
}

// Editar un registro del historial: su propio dueño, o el admin de la liga.
router.put('/:entryId', async (req, res, next) => {
  try {
    const entry = await loadEntryWithPermissionCheck(req, res);
    if (!entry) return;

    const { scoring_item_id = entry.scoring_item_id, quantity = entry.quantity } = req.body;
    const qty = Math.trunc(Number(quantity));
    if (!qty || qty <= 0) {
      return res.status(400).json({ error: 'La cantidad debe ser un número mayor que 0.' });
    }

    if (scoring_item_id !== entry.scoring_item_id) {
      const itemCheck = await pool.query(
        'SELECT id FROM scoring_items WHERE id = $1 AND league_id = $2',
        [scoring_item_id, req.league.id]
      );
      if (itemCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Ese elemento no pertenece a esta liga.' });
      }
    }

    await pool.query(
      `UPDATE entries SET scoring_item_id = $1, quantity = $2, updated_at = NOW() WHERE id = $3`,
      [scoring_item_id, qty, entry.id]
    );

    const { rows: fullRows } = await pool.query(`${SELECT_BASE} WHERE e.id = $1`, [entry.id]);
    res.json(shapeRow(fullRows[0]));
  } catch (err) {
    next(err);
  }
});

// Eliminar un registro del historial: su propio dueño, o el admin de la liga.
router.delete('/:entryId', async (req, res, next) => {
  try {
    const entry = await loadEntryWithPermissionCheck(req, res);
    if (!entry) return;

    await pool.query('DELETE FROM entries WHERE id = $1', [entry.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
