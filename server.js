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
app.use('/api/entrees', require('./routes/entrees'));
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

// Gestionnaire d'erreurs global — transforme les erreurs SQLite et autres en JSON
app.use((err, req, res, next) => {
  // Erreur Multer (fichier trop volumineux, etc.)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop volumineux (max 10 Mo).' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Champ de fichier inattendu.' });
  }

  // Erreurs SQLite (contrainte FK, CHECK, UNIQUE)
  // better-sqlite3 expose `err.code` (ex. SQLITE_CONSTRAINT_UNIQUE) ; son message
  // ne contient pas forcement 'SQLITE_', on teste donc aussi le code.
  if ((err.code && err.code.startsWith('SQLITE_')) || (err.message && err.message.includes('SQLITE_'))) {
    if (err.message.includes('FOREIGN KEY')) {
      return res.status(400).json({ error: 'Reference invalide : element lie introuvable.' });
    }
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Cet element existe deja (doublon).' });
    }
    if (err.message.includes('CHECK constraint')) {
      return res.status(400).json({ error: 'Valeur non autorisee pour ce champ.' });
    }
    console.error('Erreur SQLite:', err.message);
    return res.status(500).json({ error: 'Erreur interne de base de donnees.' });
  }

  console.error('Erreur serveur:', err.message, err.stack);
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

app.listen(PORT, () => {
  console.log('Nizar Stock - Serveur demarre sur http://localhost:' + PORT);
  console.log('Comptes: admin/admin123, assistant/assistant123');
});
