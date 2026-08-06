// routes/backup.js — Sauvegarde de la base de donnees (snapshot consistant)
const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/backup — telecharge un snapshot consistant de la base (inclus le WAL)
router.get('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const backupDir = path.join(__dirname, '..', 'database', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    '-' + pad(now.getHours()) + pad(now.getMinutes());

  const filename = 'nizar-sauvegarde-' + stamp + '.db';
  const file = path.join(backupDir, filename);

  try {
    // VACUUM INTO produit une copie consistante qui inclut les donnees du WAL
    db.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'");
    res.download(file, filename);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la sauvegarde : ' + err.message });
  }
});

module.exports = router;
