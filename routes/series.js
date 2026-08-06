// routes/series.js — Historique des plages de numeros de souche d'un article
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/series/:article_id
router.get('/:article_id', authenticate, (req, res) => {
  const db = req.db;
  const series = db.prepare(`
    SELECT s.*, a.nom as article_nom, a.unite
    FROM series_numeros s
    LEFT JOIN articles a ON s.article_id = a.id
    WHERE s.article_id = ?
    ORDER BY CAST(s.numero_debut AS INTEGER) ASC
  `).all(req.params.article_id);
  res.json({ series });
});

module.exports = router;
