// routes/inventaires.js — Grand livre / inventaire simplifie (lecture seule, base sur les mouvements)
const express = require('express');
const ExcelJS = require('exceljs');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

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
