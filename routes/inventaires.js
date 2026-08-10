// routes/inventaires.js — Grand livre (lecture) + Comptage physique (ajustement de stock)
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

// PUT /api/inventaires/:id — modifier un comptage (admin) : recompte. Annule l'effet
// stock de l'ancien ecart puis applique le nouveau, de facon relative (robuste meme
// si le stock a bouge depuis).
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const inv = db.prepare('SELECT * FROM inventaires WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Comptage introuvable.' });

  const { quantite_comptee, notes } = req.body;
  const qteNew = parseInt(quantite_comptee, 10);
  if (isNaN(qteNew) || qteNew < 0) return res.status(400).json({ error: 'La quantite comptee doit etre un nombre >= 0.' });

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(inv.article_id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  try {
    const transaction = db.transaction(() => {
      // Etat sans l'effet de l'ancien comptage.
      const stockSansAncien = article.stock_actuel - inv.ecart;
      const nouvelEcart = qteNew - stockSansAncien;

      db.prepare('UPDATE inventaires SET stock_theorique = ?, quantite_comptee = ?, ecart = ?, notes = ? WHERE id = ?')
        .run(stockSansAncien, qteNew, nouvelEcart, notes !== undefined ? notes : inv.notes, req.params.id);

      // Remplacer le mouvement d'ajustement lie a ce comptage.
      db.prepare("DELETE FROM mouvements WHERE motif LIKE 'Inventaire%' AND article_id = ? AND date = (SELECT date_inventaire FROM inventaires WHERE id = ?)")
        .run(inv.article_id, req.params.id);
      if (nouvelEcart !== 0) {
        db.prepare(`
          INSERT INTO mouvements (article_id, type, quantite, motif, user_id, date)
          VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
        `).run(inv.article_id, nouvelEcart > 0 ? 'entree' : 'sortie', Math.abs(nouvelEcart),
          'Inventaire (modifie) — ecart ' + (nouvelEcart > 0 ? '+' : '') + nouvelEcart, req.user.id);
      }

      db.prepare("UPDATE articles SET stock_actuel = ?, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(qteNew, inv.article_id);
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  logAudit(db, req.user.id, req.user.username, 'MODIF_COMPTAGE', (article.nom || '') + ' : recompte ' + inv.quantite_comptee + ' -> ' + qteNew);
  res.json({ inventaire: db.prepare('SELECT * FROM inventaires WHERE id = ?').get(req.params.id) });
});

// DELETE /api/inventaires/:id — supprimer un comptage (admin) : annule son effet
// stock (stock -= ecart) et retire le mouvement d'ajustement associe.
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const inv = db.prepare('SELECT * FROM inventaires WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Comptage introuvable.' });

  const transaction = db.transaction(() => {
    if (inv.ecart !== 0) {
      db.prepare("UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(inv.ecart, inv.article_id);
      db.prepare("DELETE FROM mouvements WHERE motif LIKE 'Inventaire%' AND article_id = ? AND date = ?")
        .run(inv.article_id, inv.date_inventaire);
    }
    db.prepare('DELETE FROM inventaires WHERE id = ?').run(req.params.id);
  });
  transaction();

  const article = db.prepare('SELECT nom FROM articles WHERE id = ?').get(inv.article_id);
  logAudit(db, req.user.id, req.user.username, 'SUPPR_COMPTAGE', (article ? article.nom : '#' + inv.article_id) + ' : comptage ' + inv.quantite_comptee + ' (ecart ' + inv.ecart + ') annule');
  res.json({ message: 'Comptage supprime, stock retabli.' });
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
    SELECT m.id, m.article_id, m.date, m.type, m.quantite, a.nom as article_nom, a.unite,
           l.nom as localite_nom, f.nom as fournisseur_nom, fr.reference as fiche_reference,
           u.username
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN localites l ON m.localite_id = l.id
    LEFT JOIN fournisseurs f ON m.fournisseur_id = f.id
    LEFT JOIN fiches_reception fr ON m.fiche_id = fr.id
    LEFT JOIN users u ON m.user_id = u.id
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
      stock_reel: soldes[r.article_id],
      lieu: r.type === 'entree' ? (r.fournisseur_nom || '-') : (r.localite_nom || '-'),
      fiche_reference: r.fiche_reference || null,
      username: r.username || null
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
    SELECT m.article_id, m.date, m.type, m.quantite, a.nom as article_nom, a.unite,
           l.nom as localite_nom, f.nom as fournisseur_nom, fr.reference as fiche_reference,
           u.username
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN localites l ON m.localite_id = l.id
    LEFT JOIN fournisseurs f ON m.fournisseur_id = f.id
    LEFT JOIN fiches_reception fr ON m.fiche_id = fr.id
    LEFT JOIN users u ON m.user_id = u.id
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
    { header: 'Stock reel', key: 'stock_reel', width: 14 },
    { header: 'Destination / Fournisseur', key: 'lieu', width: 26 },
    { header: 'Bon', key: 'fiche_reference', width: 16 },
    { header: 'Saisi par', key: 'username', width: 16 }
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
      stock_reel: soldes[r.article_id],
      lieu: r.type === 'entree' ? (r.fournisseur_nom || '-') : (r.localite_nom || '-'),
      fiche_reference: r.fiche_reference || '-',
      username: r.username || '-'
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=grand-livre.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
