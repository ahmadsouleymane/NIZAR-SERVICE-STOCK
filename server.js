// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const initDB = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialiser la base de donnees
const db = initDB();

// Injecter db dans toutes les requetes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Routes API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/articles', require('./routes/articles'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/mouvements', require('./routes/mouvements'));
app.use('/api/fournisseurs', require('./routes/fournisseurs'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/rapports', require('./routes/rapports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/localites', require('./routes/localites'));
app.use('/api/fiches', require('./routes/fiches_reception'));
app.use('/api/retours', require('./routes/retours'));
app.use('/api/import', require('./routes/import'));

// Servir les uploads
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Servir les fichiers statiques du frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback SPA : toutes les routes non-API renvoient index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API introuvable.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('Nizar Stock - Serveur demarre sur http://localhost:' + PORT);
  console.log('Comptes: admin/admin123, assistant/assistant123');
});
