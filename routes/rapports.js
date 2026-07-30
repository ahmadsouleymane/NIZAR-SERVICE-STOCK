// routes/rapports.js
const express = require('express');
const ExcelJS = require('exceljs');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/rapports/stock
router.get('/stock', authenticate, async (req, res) => {
  const db = req.db;
  const articles = db.prepare(`
    SELECT a.reference, a.nom, c.name as categorie, a.stock_actuel, a.stock_min,
           a.prix_unitaire, a.unite, f.nom as fournisseur
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    ORDER BY a.nom ASC
  `).all();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Etat du stock');

  sheet.columns = [
    { header: 'Reference', key: 'reference', width: 15 },
    { header: 'Nom', key: 'nom', width: 30 },
    { header: 'Categorie', key: 'categorie', width: 25 },
    { header: 'Stock actuel', key: 'stock_actuel', width: 15 },
    { header: 'Stock minimum', key: 'stock_min', width: 15 },
    { header: 'Statut', key: 'statut', width: 15 },
    { header: 'Prix unitaire', key: 'prix_unitaire', width: 15 },
    { header: 'Unite', key: 'unite', width: 10 },
    { header: 'Fournisseur', key: 'fournisseur', width: 25 }
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const a of articles) {
    const statut = a.stock_actuel <= 0 ? 'RUPTURE' : a.stock_actuel <= a.stock_min ? 'ALERTE' : 'OK';
    const row = sheet.addRow({ ...a, statut });

    // Couleur conditionnelle
    if (statut === 'RUPTURE') {
      row.getCell('statut').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
      row.getCell('statut').font = { color: { argb: 'FFFFFFFF' }, bold: true };
    } else if (statut === 'ALERTE') {
      row.getCell('statut').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
    } else {
      row.getCell('statut').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
      row.getCell('statut').font = { color: { argb: 'FFFFFFFF' } };
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=etat-du-stock.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/rapports/mouvements
router.get('/mouvements', authenticate, async (req, res) => {
  const db = req.db;
  const { debut, fin } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];
  if (debut) { whereClause += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { whereClause += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }

  const mouvements = db.prepare(`
    SELECT m.date, a.reference, a.nom as article, m.type, m.quantite, m.motif, m.demandeur, u.username
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN users u ON m.user_id = u.id
    ${whereClause}
    ORDER BY m.id ASC
  `).all(...params);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Historique mouvements');

  sheet.columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Reference', key: 'reference', width: 15 },
    { header: 'Article', key: 'article', width: 30 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Quantite', key: 'quantite', width: 12 },
    { header: 'Motif', key: 'motif', width: 25 },
    { header: 'Demandeur', key: 'demandeur', width: 20 },
    { header: 'Saisi par', key: 'username', width: 20 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const m of mouvements) {
    sheet.addRow(m);
  }

  // Resume
  const sheet2 = workbook.addWorksheet('Resume');
  sheet2.columns = [
    { header: 'Indicateur', key: 'label', width: 25 },
    { header: 'Valeur', key: 'value', width: 15 }
  ];
  const totalEntrees = mouvements.filter(m => m.type === 'entree').reduce((s, m) => s + m.quantite, 0);
  const totalSorties = mouvements.filter(m => m.type === 'sortie').reduce((s, m) => s + m.quantite, 0);
  sheet2.addRow({ label: 'Total entrees', value: totalEntrees });
  sheet2.addRow({ label: 'Total sorties', value: totalSorties });
  sheet2.addRow({ label: 'Solde', value: totalEntrees - totalSorties });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=historique-mouvements.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/rapports/consommation
router.get('/consommation', authenticate, async (req, res) => {
  const db = req.db;
  const { debut, fin } = req.query;

  let whereClause = "WHERE m.type = 'sortie'";
  const params = [];
  if (debut) { whereClause += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { whereClause += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }

  const consommation = db.prepare(`
    SELECT a.reference, a.nom as article, a.unite,
           SUM(m.quantite) as total_sorties,
           COUNT(*) as nb_mouvements
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    ${whereClause}
    GROUP BY m.article_id
    ORDER BY total_sorties DESC
  `).all(...params);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Consommation par article');

  sheet.columns = [
    { header: 'Reference', key: 'reference', width: 15 },
    { header: 'Article', key: 'article', width: 30 },
    { header: 'Unite', key: 'unite', width: 10 },
    { header: 'Quantite totale consommee', key: 'total_sorties', width: 25 },
    { header: 'Nb mouvements', key: 'nb_mouvements', width: 15 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const c of consommation) {
    sheet.addRow(c);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=consommation.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
