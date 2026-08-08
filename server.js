// server.js
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const initDB = require('./database/init');
const paths = require('./services/paths');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// === Middleware de securite ===
// En-tetes HTTP de securite (helmet). CSP desactive : l'app utilise des styles
// inline (style="") — une CSP stricte casserait le rendu.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS restreint : l'app est servie en same-origin (Express sert le front et l'API).
// Aucun besoin d'ouvrir les origines. Definir CORS_ORIGIN si un autre domaine doit acceder a l'API.
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));

app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Limiter les tentatives de connexion (anti brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Reessayez dans 15 minutes.' }
});
app.use('/api/auth/login', loginLimiter);

// Initialiser la base de donnees (chemin configurable pour le disque persistant)
const db = initDB(paths.dbPath);

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
app.use('/api/rapports', require('./routes/rapports'));
app.use('/api/users', require('./routes/users'));
app.use('/api/localites', require('./routes/localites'));
app.use('/api/fiches', require('./routes/fiches_reception'));
app.use('/api/retours', require('./routes/retours'));
app.use('/api/entrees', require('./routes/entrees'));
app.use('/api/series', require('./routes/series'));
app.use('/api/inventaires', require('./routes/inventaires'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/import', require('./routes/import'));
app.use('/api/trends', require('./routes/trends'));
app.use('/api/alertes', require('./routes/alertes'));
app.use('/api/recherche', require('./routes/recherche'));
app.use('/api/billets', require('./routes/billets'));

// Servir les uploads (repertoire configurable, sur le disque persistant en deploiement)
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(paths.uploadDir));

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
  // Erreur Multer (fichier trop volumineux, type non autorise, etc.)
  if (err.code === 'LIMIT_FILE_TYPE') {
    return res.status(400).json({ error: err.message || 'Type de fichier non autorise.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop volumineux (max 10 Mo).' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Champ de fichier inattendu.' });
  }

  // Erreurs SQLite (contrainte FK, CHECK, UNIQUE)
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
  if (!isProd) {
    console.log('Mode dev — comptes par defaut: admin/admin123, assistant/assistant123');
  }
});
