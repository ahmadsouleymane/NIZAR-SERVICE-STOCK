// routes/inventaires.js — Inventaire physique : comptage et ajustement du stock
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const router = express.Router();

// GET /api/inventaires — historique des comptages
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const inventaires = db.prepare(`
    SELECT i.*, a.nom as article_nom, a.reference, a.unite, u.username
    FROM inventaires i
    LEFT JOIN articles a ON i.article_id = a.id
    LEFT JOIN users u ON i.user_id = u.id
    ORDER BY i.id DESC LIMIT 200
  `).all();
  res.json({ inventaires });
});

// POST /api/inventaires — enregistrer un comptage et ajuster le stock
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { article_id, quantite_comptee, notes } = req.body;

  if (!article_id) return res.status(400).json({ error: 'Article requis.' });

  const qteComptee = parseInt(quantite_comptee, 10);
  if (isNaN(qteComptee) || qteComptee < 0) {
    return res.status(400).json({ error: 'La quantite comptee doit etre un nombre >= 0.' });
  }

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  const ecart = qteComptee - article.stock_actuel;
  const finalStock = qteComptee; // le stock rejoint la realite physique

  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO inventaires (article_id, stock_theorique, quantite_comptee, ecart, notes, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(article_id, article.stock_actuel, qteComptee, ecart, notes || null, req.user.id);

    if (ecart !== 0) {
      // Mouvement d'ajustement (entree si ecart positif, sortie si ecart negatif)
      const type = ecart > 0 ? 'entree' : 'sortie';
      const qte = Math.abs(ecart);
      db.prepare(`
        INSERT INTO mouvements (article_id, type, quantite, motif, user_id, date)
        VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
      `).run(article_id, type, qte, 'Inventaire — ecart ' + (ecart > 0 ? '+' : '') + ecart, req.user.id);

      db.prepare('UPDATE articles SET stock_actuel = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
        .run(finalStock, article_id);
    }

    return result.lastInsertRowid;
  });

  const id = transaction();
  const inventaire = db.prepare(`
    SELECT i.*, a.nom as article_nom, a.reference, a.unite, u.username
    FROM inventaires i
    LEFT JOIN articles a ON i.article_id = a.id
    LEFT JOIN users u ON i.user_id = u.id
    WHERE i.id = ?
  `).get(id);

  logAudit(db, req.user.id, req.user.username, 'INVENTAIRE', (article.nom || '') + ' : compte ' + qteComptee + ' / theorique ' + article.stock_actuel + ' (ecart ' + (ecart > 0 ? '+' : '') + ecart + ')');
  res.status(201).json({ inventaire, message: ecart === 0 ? 'Comptage exact, aucun ajustement.' : 'Stock ajuste (ecart ' + (ecart > 0 ? '+' : '') + ecart + ').' });
});

module.exports = router;
