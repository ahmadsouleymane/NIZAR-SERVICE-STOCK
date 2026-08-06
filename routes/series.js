// routes/series.js — Suivi des plages de numeros de souche + recherche par numero
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/series/recherche?numero=XXXX — retrouve la position d'un numero de souche
// dans toutes les series (entree / sortie / retour) et reconstruit sa trace.
router.get('/recherche', authenticate, (req, res) => {
  const db = req.db;
  const numero = parseInt(String(req.query.numero || '').trim(), 10);
  if (isNaN(numero) || numero <= 0) {
    return res.status(400).json({ error: 'Numero de souche invalide.' });
  }

  const series = db.prepare(`
    SELECT s.*, a.nom as article_nom, a.reference, a.type_article, a.unite,
           fr.reference as fiche_reference, fr.destinataire, fr.date_envoi,
           l.nom as localite_nom,
           rc.type_retour, rc.date_retour
    FROM series_numeros s
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN fiches_reception fr ON s.source_type = 'sortie' AND fr.id = s.source_id
    LEFT JOIN localites l ON fr.localite_id = l.id
    LEFT JOIN retours_carnets rc ON s.source_type = 'retour' AND rc.id = s.source_id
    WHERE CAST(s.numero_debut AS INTEGER) <= ?
      AND CAST(s.numero_fin AS INTEGER) >= ?
    ORDER BY s.date ASC, s.id ASC
  `).all(numero, numero);

  // Statut effectif = dernier evenement de la trace
  let statut = null;
  if (series.length) {
    const last = series[series.length - 1];
    if (last.source_type === 'retour') {
      statut = last.type_retour === 'non_utilise'
        ? { code: 'en_stock', label: 'Retourne non utilise — de nouveau en stock' }
        : { code: 'usage', label: 'Retourne usage — archive' };
    } else if (last.source_type === 'sortie') {
      statut = { code: 'envoye', label: 'Envoye a ' + (last.localite_nom || 'une agence') };
    } else {
      statut = { code: 'en_stock', label: 'En stock (entree enregistree)' };
    }
  }

  res.json({ numero, statut, series });
});

// GET /api/series/:article_id — historique des plages de numeros d'un article
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
