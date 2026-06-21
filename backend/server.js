require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const leagueRoutes = require('./routes/leagues');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false, // lo gestionamos manualmente si hace falta al añadir HTTPS/dominio propio
  })
);
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leagues', leagueRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Frontend estático (mobile-first SPA)
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Manejador de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Ha ocurrido un error en el servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍻 Borracho del año escuchando en el puerto ${PORT}`);
});
