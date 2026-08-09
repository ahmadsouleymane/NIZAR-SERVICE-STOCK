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

// =====================================================================
// V2 — Centre de rapports (moteur services/rapports.js)
// =====================================================================
const R = require('../services/rapports');

const T = (header, key, width) => ({ header, key, width });
// N et F produisaient strictement le meme objet (numFmt '#,##0' align right) : on les
// unifie pour eviter qu'un format monetaire evolue sans son homologue numerique.
const NUM = (header, key, width) => ({ header, key, width, numFmt: '#,##0', align: 'right' });
const N = NUM;
const F = NUM;

const DIM_LABEL = {
  jour: 'Jour', mois: 'Mois', article: 'Article', categorie: 'Catégorie',
  localite: 'Agence', fournisseur: 'Fournisseur', type: 'Type',
  utilisateur: 'Utilisateur', unite: 'Unité', statut: 'Statut'
};
const dimHeader = gb => DIM_LABEL[gb] || 'Libellé';

const wrap = fn => (req, res, next) => {
  try {
    const p = fn(req, res);
    if (p && typeof p.catch === 'function') {
      p.catch(err => {
        if (err instanceof R.HttpError) return res.status(err.status).json({ error: err.message });
        next(err);
      });
    }
  } catch (err) {
    if (err instanceof R.HttpError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// Références pour la barre de filtres (indépendantes des routes fournisseurs/commandes)
router.get('/v2/meta', authenticate, (req, res) => {
  res.json(R.getMeta(req.db));
});

// Ventilation du stock par dimension
router.get('/v2/ventilation-stock', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'categorie';
  const rows = R.ventilationStock(req.db, { ...opts, group_by: gb });
  const totals = { libelle: 'TOTAL', ...R.stockTotals(rows) };
  const cols = [
    T(dimHeader(gb), 'libelle', 28),
    N('Articles', 'nb_articles', 12),
    N('Stock', 'stock_actuel', 14),
    F('Valeur (FCFA)', 'valeur', 18),
    N('Ruptures', 'nb_ruptures', 12),
    N('Alertes', 'nb_alertes', 12)
  ];
  R.respond(req, res, {
    slug: 'ventilation-stock', titre: 'Ventilation du stock — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Mouvements détaillés, regroupables par jour/mois/article/catégorie/agence/fournisseur/type/utilisateur
router.get('/v2/mouvements', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'mois';
  const rows = R.aggregateMouvements(req.db, { ...opts, group_by: gb });
  const totals = { libelle: 'TOTAL', ...R.movementTotals(rows) };
  const cols = [
    T(dimHeader(gb), 'libelle', 24),
    N('Mouvements', 'nb', 12),
    N('Entrées', 'entrees', 12),
    N('Sorties', 'sorties', 12),
    N('Solde', 'solde', 12),
    F('Valeur entrées (FCFA)', 'valeur_entrees', 20),
    F('Valeur sorties (FCFA)', 'valeur_sorties', 20),
    F('Valeur nette (FCFA)', 'valeur', 18)
  ];
  R.respond(req, res, {
    slug: 'mouvements', titre: 'Mouvements détaillés — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Consommation (sorties) par article / mois / agence, top-N possible
router.get('/v2/consommation', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'article';
  const rows = R.consommation(req.db, { ...opts, group_by: gb });
  const totals = {
    libelle: 'TOTAL',
    quantite: rows.reduce((s, r) => s + r.quantite, 0),
    valeur: rows.reduce((s, r) => s + r.valeur, 0),
    nb_mouvements: rows.reduce((s, r) => s + r.nb_mouvements, 0)
  };
  const cols = [
    T(dimHeader(gb), 'libelle', 30),
    N('Quantité consommée', 'quantite', 18),
    F('Valeur (FCFA)', 'valeur', 18),
    N('Nb mouvements', 'nb_mouvements', 14)
  ];
  R.respond(req, res, {
    slug: 'consommation', titre: 'Consommation — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Sorties par agence : résumé + détail agence × article (export 2 feuilles)
router.get('/v2/sorties-agence', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const { resume, detail } = R.sortiesAgence(req.db, opts);
  const totals = {
    libelle: 'TOTAL',
    nb_mouvements: resume.reduce((s, r) => s + r.nb_mouvements, 0),
    quantite: resume.reduce((s, r) => s + r.quantite, 0),
    valeur: resume.reduce((s, r) => s + r.valeur, 0)
  };
  const resumeCols = [
    T('Agence', 'libelle', 26),
    N('Mouvements', 'nb_mouvements', 14),
    N('Quantité', 'quantite', 14),
    F('Valeur (FCFA)', 'valeur', 20)
  ];
  const detailCols = [
    T('Agence', 'localite', 26), T('Référence', 'reference', 16), T('Article', 'article', 30),
    T('Unité', 'unite', 10), N('Quantité', 'quantite', 12),
    F('Prix unitaire (FCFA)', 'prix_unitaire', 20), F('Valeur (FCFA)', 'valeur', 20)
  ];
  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'xlsx') {
    const wb = R.buildWorkbook({
      slug: 'sorties-agence', titre: 'Sorties par agence', sheetName: 'Résumé par agence',
      columns: resumeCols, rows: resume, totals,
      extraSheets: [{ name: 'Détail par agence', columns: detailCols, rows: detail }]
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="rapport-sorties-agence-' + R.todayISO() + '.xlsx"');
    return wb.xlsx.write(res).then(() => res.end());
  }
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rapport-sorties-agence-' + R.todayISO() + '.csv"');
    return res.send(R.buildCsv(resume, resumeCols));
  }
  res.json({
    meta: { slug: 'sorties-agence', titre: 'Sorties par agence', groupBy: 'localite', periode: opts.debut || opts.fin ? ((opts.debut || 'début') + ' → ' + (opts.fin || "aujourd'hui")) : 'Toute la période' },
    resume, detail, totals
  });
}));

// Entrées fournisseur (fiches d'entrée)
router.get('/v2/entrees', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'fournisseur';
  const rows = R.entreesFournisseurs(req.db, { ...opts, group_by: gb });
  const totals = {
    libelle: 'TOTAL',
    nb_fiches: rows.reduce((s, r) => s + r.nb_fiches, 0),
    quantite: rows.reduce((s, r) => s + r.quantite, 0),
    valeur: rows.reduce((s, r) => s + r.valeur, 0)
  };
  const cols = [
    T(dimHeader(gb), 'libelle', 28),
    N('Fiches d\'entrée', 'nb_fiches', 16),
    N('Quantité', 'quantite', 14),
    F('Valeur (FCFA)', 'valeur', 18)
  ];
  R.respond(req, res, {
    slug: 'entrees', titre: 'Entrées fournisseur — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Commandes & délais fournisseur
router.get('/v2/commandes', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'fournisseur';
  const rows = R.commandes(req.db, { ...opts, group_by: gb });
  const delai = rows.reduce((s, r) => s + r.delai_moyen_j * r.nb_commandes, 0) / (rows.length || 1);
  const totals = {
    libelle: 'TOTAL',
    nb_commandes: rows.reduce((s, r) => s + r.nb_commandes, 0),
    quantite: rows.reduce((s, r) => s + r.quantite, 0),
    delai_moyen_j: Math.round(delai * 10) / 10
  };
  const cols = [
    T(dimHeader(gb), 'libelle', 28),
    N('Commandes', 'nb_commandes', 14),
    N('Quantité commandée', 'quantite', 20),
    N('Délai moyen (j)', 'delai_moyen_j', 16)
  ];
  R.respond(req, res, {
    slug: 'commandes', titre: 'Commandes & délais — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Retours de carnets
router.get('/v2/retours', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'localite';
  const rows = R.retours(req.db, { ...opts, group_by: gb });
  const totals = {
    libelle: 'TOTAL',
    nb: rows.reduce((s, r) => s + r.nb, 0),
    quantite: rows.reduce((s, r) => s + r.quantite, 0),
    nb_usage: rows.reduce((s, r) => s + r.nb_usage, 0),
    nb_non_utilise: rows.reduce((s, r) => s + r.nb_non_utilise, 0)
  };
  const cols = [
    T(dimHeader(gb), 'libelle', 26),
    N('Retours', 'nb', 12),
    N('Quantité', 'quantite', 14),
    N('Usage', 'nb_usage', 12),
    N('Non utilisé', 'nb_non_utilise', 14)
  ];
  R.respond(req, res, {
    slug: 'retours', titre: 'Retours de carnets — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Inventaires & écarts
router.get('/v2/inventaires', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'article';
  const rows = R.inventaires(req.db, { ...opts, group_by: gb });
  const totals = {
    libelle: 'TOTAL',
    nb_inventaires: rows.reduce((s, r) => s + r.nb_inventaires, 0),
    stock_theorique: rows.reduce((s, r) => s + r.stock_theorique, 0),
    quantite_comptee: rows.reduce((s, r) => s + r.quantite_comptee, 0),
    ecart: rows.reduce((s, r) => s + r.ecart, 0),
    valeur_ecart: rows.reduce((s, r) => s + r.valeur_ecart, 0)
  };
  const cols = [
    T(dimHeader(gb), 'libelle', 26),
    N('Inventaires', 'nb_inventaires', 14),
    N('Stock théorique', 'stock_theorique', 16),
    N('Quantité comptée', 'quantite_comptee', 16),
    N('Écart', 'ecart', 12),
    F('Écart (FCFA)', 'valeur_ecart', 18)
  ];
  R.respond(req, res, {
    slug: 'inventaires', titre: 'Inventaires & écarts — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Alertes & ruptures (détail)
router.get('/v2/alertes', authenticate, wrap((req, res) => {
  const { rows, totals } = R.alertes(req.db);
  const cols = [
    T('Référence', 'reference', 16), T('Article', 'nom', 30), T('Catégorie', 'categorie', 22),
    T('Fournisseur', 'fournisseur', 22), N('Stock', 'stock_actuel', 12), N('Min', 'stock_min', 10),
    T('Unité', 'unite', 10), F('Valeur (FCFA)', 'valeur', 18), T('Statut', 'statut', 12)
  ];
  R.respond(req, res, {
    slug: 'alertes', titre: 'Alertes & ruptures', columns: cols, rows,
    totals: { libelle: 'TOTAL', ...totals }
  });
}));

// Fiches de réception par agence / statut / mois
router.get('/v2/fiches-reception', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const gb = opts.group_by || 'localite';
  const rows = R.fichesReception(req.db, { ...opts, group_by: gb });
  const totals = {
    libelle: 'TOTAL',
    nb_fiches: rows.reduce((s, r) => s + r.nb_fiches, 0),
    quantite: rows.reduce((s, r) => s + r.quantite, 0),
    envoyees: rows.reduce((s, r) => s + r.envoyees, 0),
    signees: rows.reduce((s, r) => s + r.signees, 0),
    archivees: rows.reduce((s, r) => s + r.archivees, 0)
  };
  const cols = [
    T(dimHeader(gb), 'libelle', 26),
    N('Fiches', 'nb_fiches', 12),
    N('Quantité', 'quantite', 14),
    N('Envoyées', 'envoyees', 12),
    N('Signées', 'signees', 12),
    N('Archivées', 'archivees', 12)
  ];
  R.respond(req, res, {
    slug: 'fiches-reception', titre: 'Fiches de réception — ' + dimHeader(gb),
    groupBy: gb, debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

// Billets en circulation par agence
router.get('/v2/series', authenticate, wrap((req, res) => {
  const rows = R.series(req.db);
  const totals = {
    libelle: 'TOTAL',
    envoyes: rows.reduce((s, r) => s + r.envoyes, 0),
    retournes_usage: rows.reduce((s, r) => s + r.retournes_usage, 0),
    retournes_stock: rows.reduce((s, r) => s + r.retournes_stock, 0),
    en_circulation: rows.reduce((s, r) => s + r.en_circulation, 0)
  };
  const cols = [
    T('Agence', 'libelle', 26),
    N('Envoyés', 'envoyes', 14),
    N('Retournés usage', 'retournes_usage', 18),
    N('Retournés stock', 'retournes_stock', 18),
    N('En circulation', 'en_circulation', 16)
  ];
  R.respond(req, res, {
    slug: 'series', titre: 'Billets en circulation par agence', columns: cols, rows, totals
  });
}));

// Articles dormants (stock non nul, sans mouvement depuis N jours)
router.get('/v2/dormants', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const { rows, totals } = R.dormants(req.db, opts);
  const cols = [
    T('Référence', 'reference', 16), T('Article', 'nom', 30), T('Catégorie', 'categorie', 22),
    N('Stock', 'stock_actuel', 12), T('Unité', 'unite', 10), F('Valeur (FCFA)', 'valeur', 18),
    T('Dernier mouvement', 'dernier_mouvement', 20)
  ];
  R.respond(req, res, {
    slug: 'dormants', titre: 'Articles dormants (' + (opts.stock_min_jours || 30) + ' jours)',
    debut: opts.debut, fin: opts.fin, columns: cols, rows,
    totals: { libelle: 'TOTAL', nb: totals.nb, valeur: totals.valeur, seuil_jours: totals.seuil_jours }
  });
}));

// Jours de couverture (stock / conso journalière moyenne)
router.get('/v2/couverture', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const { rows, totals } = R.couverture(req.db, opts);
  const cols = [
    T('Article', 'libelle', 30), T('Référence', 'reference', 16), T('Catégorie', 'categorie', 22),
    N('Stock', 'stock_actuel', 12), N('Sorties fenêtre', 'sorties_fenetre', 16),
    N('Jours de couverture', 'jours_couverture', 20), F('Valeur (FCFA)', 'valeur', 18)
  ];
  R.respond(req, res, {
    slug: 'couverture', titre: 'Jours de couverture (fenêtre ' + (opts.jours || 90) + ' j)',
    debut: opts.debut, fin: opts.fin, columns: cols, rows,
    totals: { libelle: 'TOTAL', nb: rows.length, fenetre_jours: totals.fenetre_jours }
  });
}));

// Top articles par valeur de stock
router.get('/v2/top-valeur', authenticate, wrap((req, res) => {
  const { rows, totals } = R.topValeur(req.db);
  const cols = [
    T('Référence', 'reference', 16), T('Article', 'nom', 30), T('Catégorie', 'categorie', 22),
    N('Stock', 'stock_actuel', 12), F('Prix unitaire (FCFA)', 'prix_unitaire', 20), F('Valeur (FCFA)', 'valeur', 18)
  ];
  R.respond(req, res, {
    slug: 'top-valeur', titre: 'Top 10 — articles par valeur de stock', columns: cols, rows,
    totals: { libelle: 'TOTAL', nb: rows.length, valeur_top: totals.valeur_top, valeur_totale: totals.valeur_totale }
  });
}));

// Évolution de la valeur du stock dans le temps (entrées / sorties par mois)
router.get('/v2/valeur-evolution', authenticate, wrap((req, res) => {
  const opts = R.sanitizeQuery(req.query);
  const rows = R.valeurEvolution(req.db, opts);
  const totals = {
    libelle: 'TOTAL',
    valeur_entrees: rows.reduce((s, r) => s + (r.valeur_entrees || 0), 0),
    valeur_sorties: rows.reduce((s, r) => s + (r.valeur_sorties || 0), 0),
    solde_valeur: rows.reduce((s, r) => s + (r.solde_valeur || 0), 0)
  };
  const cols = [
    T('Mois', 'libelle', 14),
    F('Valeur entrées (FCFA)', 'valeur_entrees', 22),
    F('Valeur sorties (FCFA)', 'valeur_sorties', 22),
    F('Solde valeur (FCFA)', 'solde_valeur', 20)
  ];
  R.respond(req, res, {
    slug: 'valeur-evolution', titre: 'Évolution de la valeur du stock', groupBy: 'mois',
    debut: opts.debut, fin: opts.fin, columns: cols, rows, totals
  });
}));

module.exports = router;
