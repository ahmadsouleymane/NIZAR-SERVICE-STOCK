// routes/articles.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/articles
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { search, categorie_id, alerte } = req.query;

  let query = `
    SELECT a.*, c.name as categorie_nom, f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (a.nom LIKE ? OR a.reference LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  if (categorie_id) {
    query += ' AND a.categorie_id = ?';
    params.push(categorie_id);
  }
  if (alerte === '1') {
    query += ' AND a.stock_actuel <= a.stock_min';
  }

  query += ' ORDER BY a.nom ASC';
  const articles = db.prepare(query).all(...params);
  res.json({ articles });
});

// POST /api/articles
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { reference, nom, categorie_id, description, unite, stock_min, prix_unitaire, fournisseur_id } = req.body;

  if (!reference || !nom) {
    return res.status(400).json({ error: 'Reference et nom requis.' });
  }

  const existing = db.prepare('SELECT id FROM articles WHERE reference = ?').get(reference);
  if (existing) {
    return res.status(409).json({ error: 'Cette reference existe deja.' });
  }

  const result = db.prepare(`
    INSERT INTO articles (reference, nom, categorie_id, description, unite, stock_min, prix_unitaire, fournisseur_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(reference, nom, categorie_id || null, description || null, unite || 'piece', stock_min || 10, prix_unitaire || 0, fournisseur_id || null);

  const article = db.prepare(`
    SELECT a.*, c.name as categorie_nom, f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ article });
});

// GET /api/articles/:id
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const article = db.prepare(`
    SELECT a.*, c.name as categorie_nom, f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });
  res.json({ article });
});

// PUT /api/articles/:id
router.put('/:id', authenticate, (req, res) => {
  const db = req.db;
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  const { reference, nom, categorie_id, description, unite, stock_min, prix_unitaire, fournisseur_id } = req.body;

  if (reference && reference !== article.reference) {
    const dup = db.prepare('SELECT id FROM articles WHERE reference = ? AND id != ?').get(reference, req.params.id);
    if (dup) return res.status(409).json({ error: 'Cette reference existe deja.' });
  }

  db.prepare(`
    UPDATE articles
    SET reference = ?, nom = ?, categorie_id = ?, description = ?, unite = ?,
        stock_min = ?, prix_unitaire = ?, fournisseur_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    reference || article.reference,
    nom || article.nom,
    categorie_id !== undefined ? categorie_id : article.categorie_id,
    description !== undefined ? description : article.description,
    unite || article.unite,
    stock_min !== undefined ? stock_min : article.stock_min,
    prix_unitaire !== undefined ? prix_unitaire : article.prix_unitaire,
    fournisseur_id !== undefined ? fournisseur_id : article.fournisseur_id,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT a.*, c.name as categorie_nom, f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.id = ?
  `).get(req.params.id);

  res.json({ article: updated });
});

// DELETE /api/articles/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });
  db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  res.json({ message: 'Article supprime.' });
});

module.exports = router;
