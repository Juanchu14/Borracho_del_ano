const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function publicUser(user) {
  return { id: user.id, full_name: user.full_name, username: user.username };
}

router.post('/register', async (req, res, next) => {
  try {
    const { full_name, username, password } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ error: 'El nombre completo es obligatorio.' });
    }
    if (!username || !USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'El nombre de usuario debe tener entre 3 y 30 caracteres (letras, números o "_").',
      });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (full_name, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, username`,
      [full_name.trim(), username.toLowerCase(), passwordHash]
    );

    const user = rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    }

    const { rows } = await pool.query(
      'SELECT id, full_name, username, password_hash FROM users WHERE username = $1',
      [username.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const user = rows[0];
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
