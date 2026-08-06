// routes/billets.js — Billets en circulation : par article numéroté, émis / envoyés / retournés / en stock
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/billets
router.get('/', authenticate, (req, res) => {
  const db = req.db;

  const billets = db.prepare(`
    SELECT a.id, a.nom, a.reference, a.unite, a.stock_actuel, a.stock_min,
      COALESCE((SELECT SUM(s.quantite) FROM series_numeros s WHERE s.article_id = a.id AND s.source_type = 'entree'), 0) AS total_emis,
      COALESCE((SELECT SUM(s.quantite) FROM series_numeros s WHERE s.article_id = a.id AND s.source_type = 'sortie'), 0) AS total_envoye,
      COALESCE((SELECT SUM(r.quantite) FROM retours_carnets r WHERE r.article_id = a.id AND r.type_retour = 'usage'), 0) AS total_retour_usage,
      COALESCE((SELECT SUM(r.quantite) FROM retours_carnets r WHERE r.article_id = a.id AND r.type_retour = 'non_utilise'), 0) AS total_retour_stock
    FROM articles a
    WHERE a.type_article = 'numerote'
       OR EXISTS (SELECT 1 FROM series_numeros s2 WHERE s2.article_id = a.id)
    ORDER BY a.nom ASC
  `).all();

  res.json({ billets });
});

module.exports = router;
