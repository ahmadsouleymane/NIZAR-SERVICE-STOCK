// routes/articles.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const router = express.Router();

// GET /api/articles
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { search, categorie_id, alerte } = req.query;

  let query = `
    SELECT a.*, c.name as categorie_nom, c.souches_par_unite as souches_par_unite, f.nom as fournisseur_nom
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
  const { reference, nom, categorie_id, description, unite, stock_min, prix_unitaire, fournisseur_id, souche_par_localite } = req.body;

  if (!reference || !nom) {
    return res.status(400).json({ error: 'Reference et nom requis.' });
  }

  const existing = db.prepare('SELECT id FROM articles WHERE reference = ?').get(reference);
  if (existing) {
    return res.status(409).json({ error: 'Cette reference existe deja.' });
  }

  const result = db.prepare(`
    INSERT INTO articles (reference, nom, categorie_id, description, unite, stock_min, prix_unitaire, fournisseur_id, souche_par_localite)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(reference, nom, categorie_id || null, description || null, unite || 'unite', stock_min || 10, prix_unitaire || 0, fournisseur_id || null, souche_par_localite ? 1 : 0);

  const article = db.prepare(`
    SELECT a.*, c.name as categorie_nom, c.souches_par_unite as souches_par_unite, f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);

  logAudit(db, req.user.id, req.user.username, 'CREER_ARTICLE', reference + ' — ' + nom);
  res.status(201).json({ article });
});

// GET /api/articles/:id — detail + historique des mouvements + series de numeros
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const article = db.prepare(`
    SELECT a.*, c.name as categorie_nom, c.souches_par_unite as souches_par_unite, f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  const mouvements = db.prepare(`
    SELECT m.*, u.username, f.nom as fournisseur_nom, l.nom as localite_nom
    FROM mouvements m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN fournisseurs f ON m.fournisseur_id = f.id
    LEFT JOIN localites l ON m.localite_id = l.id
    WHERE m.article_id = ?
    ORDER BY m.id DESC LIMIT 50
  `).all(req.params.id);

  const series = db.prepare(`
    SELECT s.*, fr.reference as fiche_reference, l.nom as localite_nom,
           rc.type_retour
    FROM series_numeros s
    LEFT JOIN fiches_reception fr ON s.source_type = 'sortie' AND fr.id = s.source_id
    LEFT JOIN localites l ON fr.localite_id = l.id
    LEFT JOIN retours_carnets rc ON s.source_type = 'retour' AND rc.id = s.source_id
    WHERE s.article_id = ?
    ORDER BY s.id DESC LIMIT 30
  `).all(req.params.id);

  res.json({ article, mouvements, series });
});

// PUT /api/articles/:id
router.put('/:id', authenticate, (req, res) => {
  const db = req.db;
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  const { reference, nom, categorie_id, description, unite, stock_min, prix_unitaire, fournisseur_id, souche_par_localite } = req.body;

  if (reference && reference !== article.reference) {
    const dup = db.prepare('SELECT id FROM articles WHERE reference = ? AND id != ?').get(reference, req.params.id);
    if (dup) return res.status(409).json({ error: 'Cette reference existe deja.' });
  }

  db.prepare(`
    UPDATE articles
    SET reference = ?, nom = ?, categorie_id = ?, description = ?, unite = ?,
        stock_min = ?, prix_unitaire = ?, fournisseur_id = ?, souche_par_localite = ?, updated_at = datetime('now','localtime')
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
    souche_par_localite !== undefined ? (souche_par_localite ? 1 : 0) : article.souche_par_localite,
    req.params.id
  );

  const updated = db.prepare(`
    SELECT a.*, c.name as categorie_nom, c.souches_par_unite as souches_par_unite, f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.id = ?
  `).get(req.params.id);

  res.json({ article: updated });
  logAudit(db, req.user.id, req.user.username, 'MODIF_ARTICLE', updated.reference + ' — ' + updated.nom);
});

// DELETE /api/articles/:id (admin only) — suppression forcee : l'admin peut
// supprimer un article meme s'il a de l'historique (doublon cree par erreur,
// article obsolete...). On supprime d'abord les lignes liees dans les tables
// sans ON DELETE CASCADE, pour eviter l'erreur de contrainte FK.
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });
  const tx = db.transaction(() => {
    for (const table of ['fiche_reception_articles', 'retours_carnets', 'fiche_entree_articles', 'fiche_besoin_articles']) {
      db.prepare(`DELETE FROM ${table} WHERE article_id = ?`).run(req.params.id);
    }
    db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
  });
  tx();
  logAudit(db, req.user.id, req.user.username, 'SUPPR_ARTICLE', article.reference + ' — ' + article.nom);
  res.json({ message: 'Article supprime.' });
});

module.exports = router;
