// routes/inventaires.js — Inventaire physique : comptage et ajustement du stock
const express = require('express');
const ExcelJS = require('exceljs');
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

// GET /api/inventaires/journal — grand livre chronologique (solde cumule par article)
router.get('/journal', authenticate, (req, res) => {
  const db = req.db;
  const { article_id, debut, fin } = req.query;

  let where = 'WHERE 1=1';
  const params = [];
  if (article_id) { where += ' AND m.article_id = ?'; params.push(article_id); }
  if (debut) { where += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { where += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }

  const rows = db.prepare(`
    SELECT m.id, m.article_id, m.date, m.type, m.quantite, a.nom as article_nom, a.unite
    FROM mouvements m LEFT JOIN articles a ON m.article_id = a.id
    ${where}
    ORDER BY m.article_id ASC, m.date ASC, m.id ASC
  `).all(...params);

  // Solde cumule par article, dans l'ordre chronologique (comme un releve).
  const soldes = {};
  const lignes = rows.map((r) => {
    if (soldes[r.article_id] === undefined) soldes[r.article_id] = 0;
    soldes[r.article_id] += r.type === 'entree' ? r.quantite : -r.quantite;
    return {
      date: r.date,
      article_id: r.article_id,
      article_nom: r.article_nom,
      unite: r.unite,
      entree: r.type === 'entree' ? r.quantite : 0,
      sortie: r.type === 'sortie' ? r.quantite : 0,
      stock_reel: soldes[r.article_id]
    };
  });

  res.json({ lignes });
});

// GET /api/inventaires/journal/export — export .xlsx du grand livre (memes filtres)
router.get('/journal/export', authenticate, async (req, res) => {
  const db = req.db;
  const { article_id, debut, fin } = req.query;

  let where = 'WHERE 1=1';
  const params = [];
  if (article_id) { where += ' AND m.article_id = ?'; params.push(article_id); }
  if (debut) { where += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { where += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }

  const rows = db.prepare(`
    SELECT m.article_id, m.date, m.type, m.quantite, a.nom as article_nom, a.unite
    FROM mouvements m LEFT JOIN articles a ON m.article_id = a.id
    ${where}
    ORDER BY m.article_id ASC, m.date ASC, m.id ASC
  `).all(...params);

  const soldes = {};
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Grand livre');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Article', key: 'article', width: 30 },
    { header: 'Entree', key: 'entree', width: 12 },
    { header: 'Sortie', key: 'sortie', width: 12 },
    { header: 'Stock reel', key: 'stock_reel', width: 14 }
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const r of rows) {
    if (soldes[r.article_id] === undefined) soldes[r.article_id] = 0;
    soldes[r.article_id] += r.type === 'entree' ? r.quantite : -r.quantite;
    sheet.addRow({
      date: r.date,
      article: r.article_nom,
      entree: r.type === 'entree' ? r.quantite : '',
      sortie: r.type === 'sortie' ? r.quantite : '',
      stock_reel: soldes[r.article_id]
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=grand-livre.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
