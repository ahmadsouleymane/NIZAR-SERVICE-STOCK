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
      COALESCE((SELECT SUM(r.quantite) FROM retours_carnets r WHERE r.article_id = a.id AND r.type_retour = 'non_utilise'), 0) AS total_retour_stock,
      (SELECT MAX(s2.date) FROM series_numeros s2 WHERE s2.article_id = a.id AND s2.source_type = 'sortie') AS dernier_envoi,
      (SELECT GROUP_CONCAT(DISTINCT l.nom) FROM series_numeros s3 JOIN fiches_reception fr3 ON s3.source_type = 'sortie' AND fr3.id = s3.source_id JOIN localites l ON fr3.localite_id = l.id WHERE s3.article_id = a.id) AS localites_envoyees
    FROM articles a
    WHERE a.type_article = 'numerote'
       OR EXISTS (SELECT 1 FROM series_numeros s2 WHERE s2.article_id = a.id)
    ORDER BY a.nom ASC
  `).all();

  // Vue par localité : pour chaque article numerote, repartition par agence/localite
  const parLocalite = db.prepare(`
    SELECT a.nom as article_nom, a.reference, l.nom as localite_nom,
           SUM(s.quantite) as total_envoye
    FROM series_numeros s
    JOIN articles a ON s.article_id = a.id
    JOIN fiches_reception fr ON s.source_type = 'sortie' AND fr.id = s.source_id
    JOIN localites l ON fr.localite_id = l.id
    WHERE a.type_article = 'numerote'
    GROUP BY a.id, l.id
    ORDER BY a.nom ASC, total_envoye DESC
  `).all();

  res.json({ billets, parLocalite });
});

module.exports = router;
