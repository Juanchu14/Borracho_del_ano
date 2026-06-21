const pool = require('../db');

// Comprueba que el usuario autenticado pertenece a la liga :id.
// Si pertenece, deja la liga cargada en req.league (incluye creator_id
// para que las rutas puedan comprobar permisos de administrador).
async function requireLeagueMember(req, res, next) {
  const leagueId = parseInt(req.params.id, 10);
  if (Number.isNaN(leagueId)) {
    return res.status(400).json({ error: 'Liga no válida.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.description, l.invite_code, l.creator_id, l.created_at
       FROM leagues l
       JOIN league_members lm ON lm.league_id = l.id
       WHERE l.id = $1 AND lm.user_id = $2`,
      [leagueId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Liga no encontrada o no eres miembro de ella.' });
    }

    req.league = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

// Debe usarse después de requireLeagueMember. Solo deja pasar al creador.
function requireLeagueAdmin(req, res, next) {
  if (req.league.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Solo el creador de la liga puede hacer esto.' });
  }
  next();
}

module.exports = { requireLeagueMember, requireLeagueAdmin };
