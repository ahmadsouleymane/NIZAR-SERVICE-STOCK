// routes/recherche.js — Recherche rapide globale : articles (nom/référence) + numéros de souche
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/recherche?q=... — renvoie les articles correspondants et les plages de souches contenant le numéro
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ articles: [], series: [] });

  const like = '%' + q + '%';

  const articles = db.prepare(`
    SELECT a.id, a.nom, a.reference, a.stock_actuel, a.unite, a.stock_min
    FROM articles a
    WHERE a.nom LIKE ? OR a.reference LIKE ?
    ORDER BY a.nom ASC
    LIMIT 8
  `).all(like, like);

  let series = [];
  // Une souche s'identifie par son numéro (ex. 160003) : on cherche les plages qui le contiennent,
  // ou les plages qui commencent/se terminent par le fragment saisi.
  if (/^\d+$/.test(q)) {
    const num = parseInt(q, 10);
    series = db.prepare(`
      SELECT s.id, s.article_id, s.numero_debut, s.numero_fin,
             a.nom AS article_nom, a.reference, a.unite
      FROM series_numeros s
      LEFT JOIN articles a ON s.article_id = a.id
      WHERE (CAST(s.numero_debut AS INTEGER) <= ? AND CAST(s.numero_fin AS INTEGER) >= ?)
         OR (s.numero_debut LIKE ? OR s.numero_fin LIKE ?)
      ORDER BY s.date ASC
      LIMIT 8
    `).all(num, num, like, like);
  }

  // Bons de réception : recherche par référence (le « N° » du document) ou destination
  const fiches = db.prepare(`
    SELECT fr.id, fr.reference, fr.date_creation, fr.statut, l.nom AS localite_nom
    FROM fiches_reception fr
    LEFT JOIN localites l ON fr.localite_id = l.id
    WHERE fr.reference LIKE ? OR l.nom LIKE ?
    ORDER BY fr.id DESC
    LIMIT 8
  `).all(like, like);

  res.json({ articles, series, fiches });
});

module.exports = router;
