// routes/categories.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  res.json({ categories });
});

router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis.' });

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (existing) return res.status(409).json({ error: 'Cette categorie existe deja.' });

  const result = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(name, description || null);
  const categorie = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  logAudit(db, req.user.id, req.user.username, 'CREER_CATEGORIE', name);
  res.status(201).json({ categorie });
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categorie introuvable.' });

  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis.' });

  const existing = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name, req.params.id);
  if (existing) return res.status(409).json({ error: 'Une autre categorie porte deja ce nom.' });

  db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?')
    .run(name, description !== undefined ? description : cat.description, req.params.id);
  const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  logAudit(db, req.user.id, req.user.username, 'MODIFIER_CATEGORIE', (cat.name || '') + ' -> ' + name);
  res.json({ categorie: updated });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categorie introuvable.' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  logAudit(db, req.user.id, req.user.username, 'SUPPR_CATEGORIE', cat.name || String(req.params.id));
  res.json({ message: 'Categorie supprimee.' });
});

module.exports = router;
