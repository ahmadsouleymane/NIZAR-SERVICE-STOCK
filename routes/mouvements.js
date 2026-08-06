// routes/mouvements.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
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

// POST /api/mouvements
router.post('/', authenticate, (req, res) => {
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

module.exports = router;
