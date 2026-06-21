const express = require('express');
const pool = require('../db');
const authenticate = require('../middleware/auth');

const router = express.Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

router.use(authenticate);

router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, full_name, username, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/me', async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'El nombre de usuario debe tener entre 3 y 30 caracteres (letras, números o "_").',
      });
    }

    const { rows } = await pool.query(
      `UPDATE users SET username = $1 WHERE id = $2
       RETURNING id, full_name, username`,
      [username.toLowerCase(), req.user.id]
    );

    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
    }
    next(err);
  }
});

module.exports = router;
