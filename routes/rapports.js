// routes/rapports.js
const express = require('express');
const ExcelJS = require('exceljs');
const { authenticate } = require('../middleware/auth');
const { generateStockPDF } = require('../services/pdf');
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
    { header: 'Valeur stock (FCFA)', key: 'valeur_stock', width: 18 },
    { header: 'Unite', key: 'unite', width: 12 },
    { header: 'Fournisseur', key: 'fournisseur', width: 25 }
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const a of articles) {
    const statut = a.stock_actuel <= 0 ? 'RUPTURE' : a.stock_actuel <= a.stock_min ? 'ALERTE' : 'OK';
    const row = sheet.addRow({ ...a, statut, valeur_stock: (a.prix_unitaire || 0) * (a.stock_actuel || 0) });

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

  // Feuille Resume : indicateurs cles + valeur totale du stock
  const sheet2 = workbook.addWorksheet('Resume');
  sheet2.columns = [
    { header: 'Indicateur', key: 'label', width: 30 },
    { header: 'Valeur', key: 'value', width: 18 }
  ];
  const nbAlerte = articles.filter(a => a.stock_actuel > 0 && a.stock_actuel <= a.stock_min).length;
  const nbRupture = articles.filter(a => a.stock_actuel <= 0).length;
  const valeurTotale = articles.reduce((s, a) => s + (a.prix_unitaire || 0) * (a.stock_actuel || 0), 0);
  sheet2.addRow({ label: 'Nombre d articles', value: articles.length });
  sheet2.addRow({ label: 'Nombre en alerte', value: nbAlerte });
  sheet2.addRow({ label: 'Nombre en rupture', value: nbRupture });
  sheet2.addRow({ label: 'Valeur totale du stock (FCFA)', value: valeurTotale });

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
    SELECT m.date, a.reference, a.nom as article, m.type, m.quantite, m.demandeur, u.username
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

// GET /api/rapports/sorties-agence — regroupement des sorties par localite sur une periode
router.get('/sorties-agence', authenticate, async (req, res) => {
  const db = req.db;
  const { debut, fin } = req.query;

  let whereClause = "WHERE m.type = 'sortie' AND m.localite_id IS NOT NULL";
  const params = [];
  if (debut) { whereClause += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { whereClause += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }

  // Resume par localite
  const rows = db.prepare(`
    SELECT l.nom as localite,
           COUNT(*) as nb_sorties,
           SUM(m.quantite) as quantite_totale,
           SUM(m.quantite * COALESCE(a.prix_unitaire, 0)) as valeur_estimee
    FROM mouvements m
    LEFT JOIN localites l ON m.localite_id = l.id
    LEFT JOIN articles a ON m.article_id = a.id
    ${whereClause}
    GROUP BY m.localite_id
    ORDER BY nb_sorties DESC
  `).all(...params);

  // Detail par localite : quels articles, quelles quantites, quelle valeur
  const detail = db.prepare(`
    SELECT l.nom as localite,
           a.reference, a.nom as article, a.unite,
           SUM(m.quantite) as quantite,
           COALESCE(a.prix_unitaire, 0) as prix_unitaire,
           SUM(m.quantite * COALESCE(a.prix_unitaire, 0)) as valeur
    FROM mouvements m
    LEFT JOIN localites l ON m.localite_id = l.id
    LEFT JOIN articles a ON m.article_id = a.id
    ${whereClause}
    GROUP BY m.localite_id, m.article_id
    ORDER BY localite ASC, quantite DESC
  `).all(...params);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sorties par agence');

  sheet.columns = [
    { header: 'Localite', key: 'localite', width: 25 },
    { header: 'Nb sorties', key: 'nb_sorties', width: 15 },
    { header: 'Quantite totale', key: 'quantite_totale', width: 18 },
    { header: 'Valeur estimee (FCFA)', key: 'valeur_estimee', width: 22 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const r of rows) {
    sheet.addRow(r);
  }

  // Feuille detail : articles et quantites sortis pour chaque agence
  const sheetDetail = workbook.addWorksheet('Detail par agence');
  sheetDetail.columns = [
    { header: 'Localite', key: 'localite', width: 25 },
    { header: 'Reference', key: 'reference', width: 15 },
    { header: 'Article', key: 'article', width: 30 },
    { header: 'Unite', key: 'unite', width: 12 },
    { header: 'Quantite', key: 'quantite', width: 12 },
    { header: 'Prix unitaire (FCFA)', key: 'prix_unitaire', width: 20 },
    { header: 'Valeur (FCFA)', key: 'valeur', width: 18 }
  ];

  const headerDetail = sheetDetail.getRow(1);
  headerDetail.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerDetail.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const d of detail) {
    sheetDetail.addRow(d);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sorties-par-agence.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/rapports/stock-pdf — Etat du stock en PDF A4 (streaming direct)
router.get('/stock-pdf', authenticate, (req, res) => {
  const db = req.db;
  const articles = db.prepare(`
    SELECT a.reference, a.nom, a.stock_actuel, a.stock_min, a.prix_unitaire, f.nom as fournisseur
    FROM articles a
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    ORDER BY a.nom ASC
  `).all();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="etat-du-stock.pdf"');
  generateStockPDF(articles, res);
});

module.exports = router;
