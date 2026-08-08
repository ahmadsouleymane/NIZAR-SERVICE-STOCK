// routes/series.js — Suivi des plages de numeros de souche + recherche par numero
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/series — liste filtrable de toutes les series (article, localite, statut, periode)
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { article_id, localite_id, source_type, debut, fin, search, offset } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (article_id) { where += ' AND s.article_id = ?'; params.push(article_id); }
  if (source_type) { where += ' AND s.source_type = ?'; params.push(source_type); }
  if (debut) { where += ' AND s.date >= ?'; params.push(debut); }
  if (fin) { where += ' AND s.date <= ?'; params.push(fin + ' 23:59:59'); }
  if (localite_id) {
    where += ' AND fr.localite_id = ?'; params.push(localite_id);
  }
  if (search) {
    where += ' AND (CAST(s.numero_debut AS INTEGER) <= ? AND CAST(s.numero_fin AS INTEGER) >= ?)';
    params.push(parseInt(search, 10), parseInt(search, 10));
  }

  const limit = 50;
  const off = parseInt(offset, 10) || 0;

  const series = db.prepare(`
    SELECT s.*, a.nom as article_nom, a.reference, l.nom as localite_nom,
           fr.reference as fiche_reference
    FROM series_numeros s
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN fiches_reception fr ON s.source_type = 'sortie' AND fr.id = s.source_id
    LEFT JOIN localites l ON fr.localite_id = l.id
    ${where}
    ORDER BY s.date DESC, s.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, off);

  res.json({ series });
});

// GET /api/series/recherche?numero=XXXX — retrouve la position precise d'un numero de souche
// dans toutes les series (entree / sortie / retour) et reconstruit sa trace complete.
// Gere deux regimes : carnets point de vente (reset a 001 par localite) et billets
// standard (suite continue entre agences).
router.get('/recherche', authenticate, (req, res) => {
  const db = req.db;
  const numero = parseInt(String(req.query.numero || '').trim(), 10);
  if (isNaN(numero) || numero <= 0) {
    return res.status(400).json({ error: 'Numero de souche invalide.' });
  }

  const series = db.prepare(`
    SELECT s.*, a.nom as article_nom, a.reference, a.type_article, a.unite,
           fr.reference as fiche_reference, fr.destinataire, fr.date_envoi, fr.statut as fiche_statut,
           l.nom as localite_nom,
           fe.reference as entree_reference, fe.numero_bl, fe.numero_facture,
           fo.nom as fournisseur_nom,
           rc.type_retour, rc.date_retour
    FROM series_numeros s
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN fiches_reception fr ON s.source_type = 'sortie' AND fr.id = s.source_id
    LEFT JOIN localites l ON fr.localite_id = l.id
    LEFT JOIN fiches_entree fe ON s.source_type = 'entree' AND fe.id = s.source_id
    LEFT JOIN fournisseurs fo ON fe.fournisseur_id = fo.id
    LEFT JOIN retours_carnets rc ON s.source_type = 'retour' AND rc.id = s.source_id
    WHERE CAST(s.numero_debut AS INTEGER) <= ?
      AND CAST(s.numero_fin AS INTEGER) >= ?
    ORDER BY s.date ASC, s.id ASC
  `).all(numero, numero);

  // Determiner le regime : « point de vente » (reset par localite) ou « standard »
  // (suite continue). Un article contenant « point de vente » ou « POS » dans son
  // nom est en regime POS ; le meme numero peut exister dans plusieurs localites.
  const isPointDeVente = series.length > 0 &&
    /point de vente|pos\b/i.test(series[0].article_nom || '');

  // Position du numero dans chaque plage trouvee
  const positions = series.map(function(s) {
    const debut = parseInt(s.numero_debut, 10);
    const fin = parseInt(s.numero_fin, 10);
    return {
      numero: numero,
      debut: debut,
      fin: fin,
      index: numero - debut + 1,
      total: fin - debut + 1,
      localite: s.localite_nom || null,
      source_type: s.source_type,
      article_nom: s.article_nom
    };
  });

  // Grouper par localite pour le regime point de vente (plusieurs localites
  // peuvent avoir le meme numero), ou prendre la trace unique en regime standard.
  let statut = null;
  let traceUnique = series;

  if (series.length) {
    const last = series[series.length - 1];
    if (last.source_type === 'retour') {
      statut = last.type_retour === 'non_utilise'
        ? { code: 'en_stock', label: 'Retourne non utilise — de nouveau en stock' }
        : { code: 'usage', label: 'Retourne usage — archive' };
    } else if (last.source_type === 'sortie') {
      const dest = last.localite_nom || 'une agence';
      statut = { code: 'envoye', label: 'Envoye a ' + dest + (last.date_envoi ? ' le ' + last.date_envoi.split(' ')[0] : '') };
    } else {
      const fourn = last.fournisseur_nom ? ' via ' + last.fournisseur_nom : '';
      statut = { code: 'en_stock', label: 'En stock (entree enregistree' + fourn + ')' };
    }
  }

  res.json({
    numero,
    regime: isPointDeVente ? 'point_de_vente' : 'standard',
    statut,
    series: traceUnique,
    positions: positions
  });
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
