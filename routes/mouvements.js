// routes/mouvements.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkOverlap, recordSerie } = require('../services/series');
const { logAudit } = require('../services/audit');
const router = express.Router();

// GET /api/mouvements
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { debut, fin, type, article_id, offset } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (debut) { whereClause += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { whereClause += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }
  if (type) { whereClause += ' AND m.type = ?'; params.push(type); }
  if (article_id) { whereClause += ' AND m.article_id = ?'; params.push(article_id); }

  const limit = 50;
  const off = parseInt(offset, 10) || 0;

  const mouvements = db.prepare(`
    SELECT m.*, a.nom as article_nom, a.reference as article_reference,
           u.username, f.nom as fournisseur_nom
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN fournisseurs f ON m.fournisseur_id = f.id
    ${whereClause}
    ORDER BY m.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, off);

  // Totals
  let totalsWhere = 'WHERE 1=1';
  const totalsParams = [];
  if (debut) { totalsWhere += ' AND date >= ?'; totalsParams.push(debut); }
  if (fin) { totalsWhere += ' AND date <= ?'; totalsParams.push(fin + ' 23:59:59'); }
  if (article_id) { totalsWhere += ' AND article_id = ?'; totalsParams.push(article_id); }

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'entree' THEN quantite ELSE 0 END), 0) as total_entrees,
      COALESCE(SUM(CASE WHEN type = 'sortie' THEN quantite ELSE 0 END), 0) as total_sorties
    FROM mouvements
    ${totalsWhere}
  `).get(...totalsParams);

  res.json({ mouvements, totals });
});

// POST /api/mouvements — mouvement générique (admin seulement).
// L'UI ne l'utilise plus : les entrées/sorties passent par les fiches (photos/impression).
// Le restreindre empeche de modifier le stock hors des flux metier.
router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { article_id, type, quantite, motif, demandeur, fournisseur_id } = req.body;

  if (!article_id || !type || !quantite) {
    return res.status(400).json({ error: 'Article, type et quantite requis.' });
  }

  if (!['entree', 'sortie'].includes(type)) {
    return res.status(400).json({ error: 'Type doit etre entree ou sortie.' });
  }

  const qte = parseInt(quantite, 10);
  if (isNaN(qte) || qte <= 0) {
    return res.status(400).json({ error: 'La quantite doit etre un nombre positif.' });
  }

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  // Verifier stock suffisant pour les sorties
  if (type === 'sortie' && article.stock_actuel < qte) {
    return res.status(400).json({
      error: 'Stock insuffisant. Stock actuel : ' + article.stock_actuel + ' ' + article.unite
    });
  }

  // Verifier le fournisseur si fourni
  if (fournisseur_id) {
    const fournisseur = db.prepare('SELECT id FROM fournisseurs WHERE id = ?').get(fournisseur_id);
    if (!fournisseur) return res.status(400).json({ error: 'Fournisseur introuvable.' });
  }

  let mouvement = null;
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO mouvements (article_id, type, quantite, motif, demandeur, user_id, fournisseur_id, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `).run(article_id, type, qte, motif || null, demandeur || null, req.user.id, fournisseur_id || null);

    const delta = type === 'entree' ? qte : -qte;
    db.prepare('UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
      .run(delta, article_id);

    mouvement = db.prepare(`
      SELECT m.*, a.nom as article_nom, u.username
      FROM mouvements m
      LEFT JOIN articles a ON m.article_id = a.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);
  });

  transaction();
  res.status(201).json({ mouvement });
});

// GET /api/mouvements/anomalies — mouvements d'articles numerotes sans plage de
// numeros valide (essentiellement issus de l'import historique).
router.get('/anomalies', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const anomalies = db.prepare(`
    SELECT m.id, m.date, m.type, m.quantite, m.motif, a.id as article_id, a.nom as article_nom, l.nom as localite_nom
    FROM mouvements m
    JOIN articles a ON m.article_id = a.id
    LEFT JOIN localites l ON m.localite_id = l.id
    WHERE a.type_article = 'numerote' AND (m.numero_debut IS NULL OR m.numero_fin IS NULL)
    ORDER BY m.date ASC, m.id ASC
    LIMIT 500
  `).all();
  res.json({ anomalies });
});

// PATCH /api/mouvements/:id/numero — correction manuelle admin d'une plage manquante
router.patch('/:id/numero', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { numero_debut, numero_fin } = req.body;

  const mvt = db.prepare('SELECT m.*, a.type_article, a.nom as article_nom FROM mouvements m JOIN articles a ON m.article_id = a.id WHERE m.id = ?').get(req.params.id);
  if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
  if (mvt.numero_debut || mvt.numero_fin) return res.status(400).json({ error: 'Ce mouvement a deja une plage de numeros enregistree.' });

  try {
    const transaction = db.transaction(() => {
      const overlap = checkOverlap(db, mvt.article_id, numero_debut, numero_fin, mvt.type === 'entree' ? 'entree' : 'sortie');
      if (overlap) throw new Error('Chevauchement pour ' + mvt.article_nom + ' : plage ' + numero_debut + '-' + numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');

      db.prepare('UPDATE mouvements SET numero_debut = ?, numero_fin = ? WHERE id = ?').run(String(numero_debut), String(numero_fin), req.params.id);
      recordSerie(db, mvt.article_id, numero_debut, numero_fin, mvt.quantite, mvt.type === 'entree' ? 'entree' : 'sortie', req.params.id);
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  logAudit(db, req.user.id, req.user.username, 'CORRIGER_NUMERO', mvt.article_nom + ' — mouvement #' + req.params.id + ' -> ' + numero_debut + '-' + numero_fin);
  const updated = db.prepare('SELECT * FROM mouvements WHERE id = ?').get(req.params.id);
  res.json({ mouvement: updated });
});

module.exports = router;
