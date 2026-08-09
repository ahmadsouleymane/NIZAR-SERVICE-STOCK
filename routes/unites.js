// routes/unites.js — Unites de mesure des articles (persistees en base, extensibles par l'admin)
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const unites = db.prepare('SELECT * FROM unites ORDER BY label ASC').all();
  res.json({ unites });
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const label = String(req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Nom d\'unite requis.' });

  const diacritics = new RegExp('[̀-ͯ]', 'g');
  const code = label.toLowerCase().normalize('NFD').replace(diacritics, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!code) return res.status(400).json({ error: 'Nom d\'unite invalide.' });

  const existing = db.prepare('SELECT id FROM unites WHERE code = ?').get(code);
  if (existing) return res.status(409).json({ error: 'Cette unite existe deja.' });

  const result = db.prepare('INSERT INTO unites (code, label) VALUES (?, ?)').run(code, label);
  const unite = db.prepare('SELECT * FROM unites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ unite });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const unite = db.prepare('SELECT * FROM unites WHERE id = ?').get(req.params.id);
  if (!unite) return res.status(404).json({ error: 'Unite introuvable.' });

  const enUsage = db.prepare('SELECT COUNT(*) as n FROM articles WHERE unite = ?').get(unite.code);
  if (enUsage.n > 0) return res.status(409).json({ error: 'Unite utilisee par ' + enUsage.n + ' article(s) : impossible de la supprimer.' });

  db.prepare('DELETE FROM unites WHERE id = ?').run(req.params.id);
  res.json({ message: 'Unite supprimee.' });
});

module.exports = router;
