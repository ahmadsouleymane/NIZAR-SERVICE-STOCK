// services/uploads.js — Config multer partagee (securite : allowlist d'extensions, nom de fichier assaini)
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];

// Creer le dossier d'upload de facon autonome (multer echoue en ENOENT sinon)
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function createUpload(field) {
  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: function(req, file, cb) {
      const ext = (path.extname(file.originalname) || '').toLowerCase();
      const safeExt = ALLOWED_EXT.includes(ext) ? ext : '.jpg';
      cb(null, 'upload-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + safeExt);
    }
  });
  return multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
      const ext = (path.extname(file.originalname) || '').toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        return cb(Object.assign(new Error('Type de fichier non autorise (images ou PDF uniquement).'), { code: 'LIMIT_FILE_TYPE' }));
      }
      cb(null, true);
    }
  }).single(field);
}

module.exports = { createUpload };
