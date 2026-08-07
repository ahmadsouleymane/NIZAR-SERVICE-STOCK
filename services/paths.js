// services/paths.js — Chemins configurables (base de donnees + uploads)
// En deploiement (Render/Railway/Fly), DB_PATH et UPLOAD_DIR pointent vers le
// disque persistant (volume). En local, on garde les repertoires du projet.
const path = require('path');

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads');
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'nizar.db');

module.exports = {
  uploadDir,
  dbPath,
  // Les sauvegardes se font a cote de la base (donc sur le meme disque persistant)
  backupDir: path.join(path.dirname(dbPath), 'backups')
};
