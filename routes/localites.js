// routes/localites.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = req.db;
  // Agences d'abord, puis services internes du siege
  const localites = db.prepare('SELECT * FROM localites ORDER BY est_service ASC, type DESC, nom ASC').all();
  res.json({ localites });
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { nom, type, pays, est_service } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis.' });

  const typeVal = type || 'national';
  if (!['national', 'international'].includes(typeVal)) {
    return res.status(400).json({ error: 'Type invalide (national ou international).' });
  }

  const existing = db.prepare('SELECT id FROM localites WHERE nom = ?').get(nom);
  if (existing) return res.status(409).json({ error: 'Cette localite existe deja.' });
  const result = db.prepare('INSERT INTO localites (nom, type, pays, est_service) VALUES (?, ?, ?, ?)')
    .run(nom, typeVal, pays || 'Niger', est_service ? 1 : 0);
  const localite = db.prepare('SELECT * FROM localites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ localite });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const l = db.prepare('SELECT * FROM localites WHERE id = ?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Localite introuvable.' });
  db.prepare('DELETE FROM localites WHERE id = ?').run(req.params.id);
  res.json({ message: 'Localite supprimee.' });
});

module.exports = router;
