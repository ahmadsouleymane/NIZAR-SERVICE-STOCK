// routes/fournisseurs.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/fournisseurs
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const fournisseurs = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM articles WHERE fournisseur_id = f.id) as nb_articles,
      (SELECT COUNT(*) FROM commandes WHERE fournisseur_id = f.id) as nb_commandes
    FROM fournisseurs f
    ORDER BY f.nom ASC
  `).all();
  res.json({ fournisseurs });
});

// POST /api/fournisseurs (admin only)
router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { nom, contact, telephone, email, adresse, delai_moyen_j } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis.' });

  const result = db.prepare(`
    INSERT INTO fournisseurs (nom, contact, telephone, email, adresse, delai_moyen_j)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(nom, contact || null, telephone || null, email || null, adresse || null, delai_moyen_j || 7);

  const fournisseur = db.prepare('SELECT * FROM fournisseurs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ fournisseur });
});

// GET /api/fournisseurs/:id
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fournisseur = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM articles WHERE fournisseur_id = f.id) as nb_articles,
      (SELECT COUNT(*) FROM commandes WHERE fournisseur_id = f.id) as nb_commandes
    FROM fournisseurs f WHERE f.id = ?
  `).get(req.params.id);
  if (!fournisseur) return res.status(404).json({ error: 'Fournisseur introuvable.' });

  const articles = db.prepare('SELECT id, reference, nom, stock_actuel, prix_unitaire FROM articles WHERE fournisseur_id = ?').all(req.params.id);
  const commandes = db.prepare('SELECT id, statut, date_commande FROM commandes WHERE fournisseur_id = ? ORDER BY id DESC LIMIT 20').all(req.params.id);

  res.json({ fournisseur, articles, commandes });
});

// PUT /api/fournisseurs/:id
router.put('/:id', authenticate, (req, res) => {
  const db = req.db;
  const f = db.prepare('SELECT * FROM fournisseurs WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Fournisseur introuvable.' });

  const { nom, contact, telephone, email, adresse, delai_moyen_j } = req.body;

  db.prepare(`
    UPDATE fournisseurs
    SET nom = ?, contact = ?, telephone = ?, email = ?, adresse = ?, delai_moyen_j = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nom || f.nom, contact !== undefined ? contact : f.contact,
    telephone !== undefined ? telephone : f.telephone, email !== undefined ? email : f.email,
    adresse !== undefined ? adresse : f.adresse,
    delai_moyen_j !== undefined ? delai_moyen_j : f.delai_moyen_j, req.params.id
  );

  const fournisseur = db.prepare('SELECT * FROM fournisseurs WHERE id = ?').get(req.params.id);
  res.json({ fournisseur });
});

// DELETE /api/fournisseurs/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const f = db.prepare('SELECT * FROM fournisseurs WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Fournisseur introuvable.' });
  db.prepare('DELETE FROM fournisseurs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Fournisseur supprime.' });
});

module.exports = router;
