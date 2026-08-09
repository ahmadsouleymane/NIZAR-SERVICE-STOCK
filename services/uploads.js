// services/uploads.js — Config multer partagee (securite : allowlist d'extensions, nom de fichier assaini)
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDir } = require('./paths');

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];

// Creer le dossier d'upload de facon autonome (multer echoue en ENOENT sinon)
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Signatures binaires (magic bytes) : l'extension declaree par le client n'est pas
// fiable (un .svg avec du JS peut etre renomme en .jpg). On verifie le contenu reel
// une fois le fichier ecrit sur disque par multer.
function checkSignature(buf, ext) {
  if (ext === '.jpg' || ext === '.jpeg') return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (ext === '.png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (ext === '.gif') return buf.slice(0, 4).toString('ascii') === 'GIF8';
  if (ext === '.webp') return buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  if (ext === '.pdf') return buf.slice(0, 4).toString('ascii') === '%PDF';
  return false;
}

function verifyMagicBytes(req, res, next) {
  if (!req.file) return next();
  const ext = path.extname(req.file.filename).toLowerCase();
  let ok = false;
  try {
    const fd = fs.openSync(req.file.path, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    ok = checkSignature(buf, ext);
  } catch (e) { ok = false; }

  if (!ok) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    return res.status(400).json({ error: 'Le contenu du fichier ne correspond pas au type attendu (image ou PDF).' });
  }
  next();
}

function createUpload(field) {
  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: function(req, file, cb) {
      const ext = (path.extname(file.originalname) || '').toLowerCase();
      const safeExt = ALLOWED_EXT.includes(ext) ? ext : '.jpg';
      cb(null, 'upload-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + safeExt);
    }
  });
  const upload = multer({
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

  return [upload, verifyMagicBytes];
}

module.exports = { createUpload };
