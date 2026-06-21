const express = require('express');
const pool = require('../db');
const authenticate = require('../middleware/auth');
const { requireLeagueMember, requireLeagueAdmin } = require('../middleware/league');
const { generateInviteCode } = require('../utils/inviteCode');

const scoringRouter = require('./scoring');
const entriesRouter = require('./entries');

const router = express.Router();
router.use(authenticate);

function leagueResponse(league, isAdmin) {
  return {
    id: league.id,
    name: league.name,
    description: league.description,
    invite_code: league.invite_code,
    creator_id: league.creator_id,
    created_at: league.created_at,
    is_admin: isAdmin,
  };
}

// Crear una liga nueva. El creador se añade automáticamente como miembro.
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la liga es obligatorio.' });
    }

    await client.query('BEGIN');

    // Reintenta si por casualidad el código generado ya existe.
    let league;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      try {
        const { rows } = await client.query(
          `INSERT INTO leagues (name, description, invite_code, creator_id)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [name.trim(), description ? description.trim() : null, code, req.user.id]
        );
        league = rows[0];
        break;
      } catch (err) {
        if (err.code === '23505' && attempt < 4) continue; // código duplicado, reintenta
        throw err;
      }
    }

    await client.query(
      'INSERT INTO league_members (league_id, user_id) VALUES ($1, $2)',
      [league.id, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json(leagueResponse(league, true));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Unirse a una liga mediante código de invitación.
router.post('/join', async (req, res, next) => {
  try {
    const { invite_code } = req.body;
    if (!invite_code || !invite_code.trim()) {
      return res.status(400).json({ error: 'Introduce un código de invitación.' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM leagues WHERE invite_code = $1',
      [invite_code.trim().toUpperCase()]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Código de invitación no válido.' });
    }
    const league = rows[0];

    try {
      await pool.query(
        'INSERT INTO league_members (league_id, user_id) VALUES ($1, $2)',
        [league.id, req.user.id]
      );
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Ya eres miembro de esta liga.' });
      }
      throw err;
    }

    res.status(201).json(leagueResponse(league, league.creator_id === req.user.id));
  } catch (err) {
    next(err);
  }
});

// Ligas a las que pertenece el usuario autenticado.
router.get('/mine', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT l.*, (
         SELECT COUNT(*) FROM league_members WHERE league_id = l.id
       ) AS member_count
       FROM leagues l
       JOIN league_members lm ON lm.league_id = l.id
       WHERE lm.user_id = $1
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    res.json(
      rows.map((l) => ({ ...leagueResponse(l, l.creator_id === req.user.id), member_count: Number(l.member_count) }))
    );
  } catch (err) {
    next(err);
  }
});

// Detalle de una liga concreta.
router.get('/:id', requireLeagueMember, async (req, res) => {
  res.json(leagueResponse(req.league, req.league.creator_id === req.user.id));
});

// Editar nombre/descripción. Solo el creador.
router.put('/:id', requireLeagueMember, requireLeagueAdmin, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre de la liga es obligatorio.' });
    }

    const { rows } = await pool.query(
      `UPDATE leagues SET name = $1, description = $2 WHERE id = $3 RETURNING *`,
      [name.trim(), description ? description.trim() : null, req.league.id]
    );
    res.json(leagueResponse(rows[0], true));
  } catch (err) {
    next(err);
  }
});

// Miembros de la liga (para el selector "ver historial de un integrante").
router.get('/:id/members', requireLeagueMember, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.username
       FROM users u
       JOIN league_members lm ON lm.user_id = u.id
       WHERE lm.league_id = $1
       ORDER BY u.full_name ASC`,
      [req.league.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Clasificación de la liga: puntos totales y desglose por sistema de puntuación.
router.get('/:id/ranking', requireLeagueMember, async (req, res, next) => {
  try {
    const itemsResult = await pool.query(
      `SELECT id, name, emoji, points FROM scoring_items
       WHERE league_id = $1 ORDER BY points DESC, name ASC`,
      [req.league.id]
    );
    const scoringItems = itemsResult.rows;

    const membersResult = await pool.query(
      `SELECT u.id, u.full_name, u.username
       FROM users u
       JOIN league_members lm ON lm.user_id = u.id
       WHERE lm.league_id = $1`,
      [req.league.id]
    );

    const totalsResult = await pool.query(
      `SELECT e.user_id, e.scoring_item_id, SUM(e.quantity)::int AS qty
       FROM entries e
       WHERE e.league_id = $1
       GROUP BY e.user_id, e.scoring_item_id`,
      [req.league.id]
    );

    const breakdownByUser = new Map();
    for (const row of totalsResult.rows) {
      if (!breakdownByUser.has(row.user_id)) breakdownByUser.set(row.user_id, {});
      breakdownByUser.get(row.user_id)[row.scoring_item_id] = row.qty;
    }

    const pointsByItem = new Map(scoringItems.map((it) => [it.id, it.points]));

    const ranking = membersResult.rows.map((member) => {
      const items = breakdownByUser.get(member.id) || {};
      let totalPoints = 0;
      for (const [itemId, qty] of Object.entries(items)) {
        totalPoints += qty * (pointsByItem.get(Number(itemId)) || 0);
      }
      return {
        user_id: member.id,
        full_name: member.full_name,
        username: member.username,
        total_points: totalPoints,
        items,
      };
    });

    ranking.sort((a, b) => b.total_points - a.total_points);

    res.json({ scoring_items: scoringItems, ranking });
  } catch (err) {
    next(err);
  }
});

router.use('/:id/scoring', requireLeagueMember, scoringRouter);
router.use('/:id/entries', requireLeagueMember, entriesRouter);

module.exports = router;
