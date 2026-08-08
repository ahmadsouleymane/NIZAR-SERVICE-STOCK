// server.js
// Charge le fichier .env local s'il existe (jamais en production : Render fournit
// les variables via son tableau de bord, et dotenv ne remplace pas les env existants).
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const initDB = require('./database/init');
const paths = require('./services/paths');

const app = express();
// Derrière le proxy Render : nécessaire pour express-rate-limit (X-Forwarded-For).
app.set('trust proxy', 1);
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

// La base est injectée dans req.db. Elle est initialisée APRÈS la restauration
// depuis GitHub (voir boot() en bas de fichier) — un accès avant ne voit que null.
let db = null;
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Sante du service (public) — utilisé par le front pour détecter le réveil du
// back-end (plan Render gratuit : mise en veille après 15 min d'inactivité).
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
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

// Démarrage : initialise la base, lance les sauvegardes, puis écoute.
function boot() {
  db = initDB(paths.dbPath);

  // Sauvegarde GitHub de la base (plan Render gratuit = pas de disque persistant) :
  // pousse toutes les ~3 min et à l'arrêt (SIGTERM). La restauration est faite
  // AVANT initDB ci-dessous. Inactif si GH_BACKUP_REPO non défini.
  require('./services/cloud_backup').start(db);

  // Synchronisation des uploads (photos, PDF) vers Cloudflare R2 : restaure au
  // démarrage, synchronise toutes les ~5 min et à l'arrêt. Inactif si R2_* non définis.
  require('./services/r2_backup').start(paths.uploadDir);

  app.listen(PORT, () => {
    console.log('Nizar Stock - Serveur demarre sur http://localhost:' + PORT);
    if (!isProd) {
      console.log('Mode dev — comptes par defaut: admin/admin123, assistant/assistant123');
    }
  });
}

// Restaure la base depuis GitHub AVANT d'initialiser le fichier local : sur le
// disque éphémère de Render, le fichier n'existe pas encore → on télécharge la
// dernière sauvegarde. En local, une base avec des données est toujours conservée.
require('./services/cloud_backup').restore()
  .catch(function (err) { console.error('[backup] Restauration impossible :', err.message); })
  .finally(boot);
