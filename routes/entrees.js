// routes/entrees.js — Entrees fournisseur (enregistrement sans impression)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkOverlap, recordSerie } = require('../services/series');
const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: function(req, file, cb) {
    cb(null, 'photo-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

function generateRef(db) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const count = db.prepare("SELECT COUNT(*) as c FROM fiches_entree WHERE created_at >= date('now')").get().c;
  return 'FE-' + y + m + '-' + String(count + 1).padStart(3, '0');
}

// GET /api/entrees — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { fournisseur_id, statut, debut, fin } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (fournisseur_id) { where += ' AND fe.fournisseur_id = ?'; params.push(fournisseur_id); }
  if (statut) { where += ' AND fe.statut = ?'; params.push(statut); }
  if (debut) { where += ' AND fe.date_entree >= ?'; params.push(debut); }
  if (fin) { where += ' AND fe.date_entree <= ?'; params.push(fin + ' 23:59:59'); }

  const fiches = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom, u.username as cree_par,
      (SELECT COUNT(*) FROM fiche_entree_articles WHERE fiche_id = fe.id) as nb_lignes,
      (SELECT COUNT(*) FROM fiche_entree_photos WHERE fiche_id = fe.id) as nb_photos
    FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    LEFT JOIN users u ON fe.user_id = u.id
    ${where}
    ORDER BY fe.id DESC LIMIT 200
  `).all(...params);
  res.json({ fiches });
});

// GET /api/entrees/:id — detail (lignes + photos)
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom, u.username as cree_par
    FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    LEFT JOIN users u ON fe.user_id = u.id
    WHERE fe.id = ?
  `).get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });

  const lignes = db.prepare(`
    SELECT fea.*, a.nom as article_nom, a.reference, a.unite, a.type_article
    FROM fiche_entree_articles fea
    LEFT JOIN articles a ON fea.article_id = a.id
    WHERE fea.fiche_id = ?
  `).all(req.params.id);

  const photos = db.prepare('SELECT * FROM fiche_entree_photos WHERE fiche_id = ? ORDER BY id').all(req.params.id);
  res.json({ fiche, lignes, photos });
});

// POST /api/entrees — creer une entree (aucune impression)
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { fournisseur_id, numero_bl, numero_facture, notes, articles } = req.body;

  if (!articles || !articles.length) return res.status(400).json({ error: 'Au moins un article requis.' });

  if (fournisseur_id) {
    const f = db.prepare('SELECT id FROM fournisseurs WHERE id = ?').get(fournisseur_id);
    if (!f) return res.status(400).json({ error: 'Fournisseur introuvable.' });
  }

  for (let i = 0; i < articles.length; i++) {
    const qte = parseInt(articles[i].quantite, 10);
    if (isNaN(qte) || qte <= 0) return res.status(400).json({ error: 'Quantite invalide ligne ' + (i + 1) + '.' });
    articles[i].quantite = qte;
  }

  const reference = generateRef(db);
  let ficheId = null;

  try {
    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO fiches_entree (reference, fournisseur_id, date_entree, numero_bl, numero_facture, notes, user_id, statut)
        VALUES (?, ?, datetime('now'), ?, ?, ?, ?, 'validee')
      `).run(reference, fournisseur_id || null, numero_bl || null, numero_facture || null, notes || null, req.user.id);
      ficheId = result.lastInsertRowid;

      const insertLigne = db.prepare(`
        INSERT INTO fiche_entree_articles (fiche_id, article_id, quantite, numero_debut, numero_fin, observation)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertMvt = db.prepare(`
        INSERT INTO mouvements (article_id, type, quantite, motif, user_id, fournisseur_id, entree_id, numero_debut, numero_fin, date)
        VALUES (?, 'entree', ?, 'Entree fournisseur — ' || ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      const updateStock = db.prepare(`
        UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime('now') WHERE id = ?
      `);

      for (const art of articles) {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.article_id);
        if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');

        if (article.type_article === 'numerote') {
          const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'entree');
          if (overlap) throw new Error('Chevauchement pour ' + article.nom + ' : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
          recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'entree', ficheId);
        }

        insertLigne.run(ficheId, art.article_id, art.quantite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
        insertMvt.run(art.article_id, art.quantite, reference, req.user.id, fournisseur_id || null, ficheId, art.numero_debut || null, art.numero_fin || null);
        updateStock.run(art.quantite, art.article_id);
      }
    });

    transaction();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(ficheId);
  const lignes = db.prepare(`
    SELECT fea.*, a.nom as article_nom, a.unite FROM fiche_entree_articles fea
    LEFT JOIN articles a ON fea.article_id = a.id WHERE fea.fiche_id = ?
  `).all(ficheId);
  res.status(201).json({ fiche, lignes, message: 'Entree enregistree (aucune impression).' });
});

// POST /api/entrees/:id/photos — upload photo bon de livraison / facture
router.post('/:id/photos', authenticate, upload.single('photo'), (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });
  if (!req.file) return res.status(400).json({ error: 'Photo requise.' });

  const type = req.body.type || 'autre';
  if (!['bl', 'facture', 'autre'].includes(type)) {
    return res.status(400).json({ error: 'Type de photo invalide (bl, facture ou autre).' });
  }

  const photoPath = '/uploads/' + req.file.filename;
  const result = db.prepare(`
    INSERT INTO fiche_entree_photos (fiche_id, fichier_path, type) VALUES (?, ?, ?)
  `).run(req.params.id, photoPath, type);

  const photo = db.prepare('SELECT * FROM fiche_entree_photos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ photo });
});

// DELETE /api/entrees/:id (admin seulement)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });

  const lignes = db.prepare('SELECT * FROM fiche_entree_articles WHERE fiche_id = ?').all(req.params.id);

  for (const l of lignes) {
    const article = db.prepare('SELECT stock_actuel FROM articles WHERE id = ?').get(l.article_id);
    if (article && article.stock_actuel < l.quantite) {
      return res.status(400).json({
        error: 'Suppression impossible : stock article #' + l.article_id + ' (' + article.stock_actuel + ') inferieur a la quantite de l entree (' + l.quantite + '). Des sorties ont eu lieu.'
      });
    }
  }

  const transaction = db.transaction(() => {
    for (const l of lignes) {
      db.prepare('UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime(\'now\') WHERE id = ?').run(l.quantite, l.article_id);
    }
    db.prepare("DELETE FROM series_numeros WHERE source_type = 'entree' AND source_id = ?").run(req.params.id);
    db.prepare('DELETE FROM mouvements WHERE entree_id = ?').run(req.params.id);
    db.prepare('DELETE FROM fiches_entree WHERE id = ?').run(req.params.id);
  });
  transaction();
  res.json({ message: 'Entree supprimee (stock ajuste).' });
});

module.exports = router;
