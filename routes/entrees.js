// routes/entrees.js — Entrees fournisseur (enregistrement sans impression)
const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkOverlap, recordSerie, parseNumero } = require('../services/series');
const { createUpload } = require('../services/uploads');
const { logAudit } = require('../services/audit');
const router = express.Router();

const upload = createUpload('photo');

function generateRef(db) {
  // Reference basee sur la sequence autoincrement : jamais reutilisee, donc pas de collision
  // (meme apres une suppression, contrairement a un simple compteur).
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'fiches_entree'").get();
  const next = (seq ? seq.seq : 0) + 1;
  return 'FE-' + y + m + '-' + String(next).padStart(3, '0');
}

// GET /api/entrees — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { fournisseur_id, statut, debut, fin, offset } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (fournisseur_id) { where += ' AND fe.fournisseur_id = ?'; params.push(fournisseur_id); }
  if (statut) { where += ' AND fe.statut = ?'; params.push(statut); }
  if (debut) { where += ' AND fe.date_entree >= ?'; params.push(debut); }
  if (fin) { where += ' AND fe.date_entree <= ?'; params.push(fin + ' 23:59:59'); }

  const limit = 50;
  const off = parseInt(offset, 10) || 0;

  const fiches = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom, u.username as cree_par,
      (SELECT COUNT(*) FROM fiche_entree_articles WHERE fiche_id = fe.id) as nb_lignes,
      (SELECT COUNT(*) FROM fiche_entree_photos WHERE fiche_id = fe.id) as nb_photos
    FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    LEFT JOIN users u ON fe.user_id = u.id
    ${where}
    ORDER BY fe.id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, off);
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

// POST /api/entrees — creer un brouillon d'entree (stock NON incremente avant validation)
// Les articles saisis sont conserves dans articles_json et lus a la validation.
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
        INSERT INTO fiches_entree (reference, fournisseur_id, date_entree, numero_bl, numero_facture, notes, user_id, statut, validee, articles_json)
        VALUES (?, ?, datetime('now','localtime'), ?, ?, ?, ?, 'validee', 0, ?)
      `).run(reference, fournisseur_id || null, numero_bl || null, numero_facture || null, notes || null, req.user.id, JSON.stringify(articles));
      ficheId = result.lastInsertRowid;
    });
    transaction();
  } catch (err) {
    // Erreur technique (SQLite/disque) : laisser le handler global de server.js la mapper
    // (FK→400, UNIQUE→409, CHECK→400, sinon 500). 400 reserve aux erreurs metier.
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(ficheId);
  logAudit(db, req.user.id, req.user.username, 'CREER_ENTREE', reference);
  res.status(201).json({ fiche, message: 'Brouillon cree. Photos du bon de livraison et de la facture requises avant validation.' });
});

// POST /api/entrees/:id/valider — valider un brouillon (photos BL + facture obligatoires)
// Reutilise la validation des articles, l'insertion des lignes, des mouvements et du stock
// qui etait auparavant dans POST /. No-op si deja validee.
router.post('/:id/valider', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });
  if (fiche.validee === 1) return res.status(400).json({ error: 'Entree deja validee.' });

  // Photo du bon de livraison ET de la facture obligatoires
  const hasBL = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'bl'").get(req.params.id).c;
  const hasFacture = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'facture'").get(req.params.id).c;
  if (hasBL === 0 || hasFacture === 0) {
    const missing = [];
    if (hasBL === 0) missing.push('bon de livraison');
    if (hasFacture === 0) missing.push('facture');
    return res.status(400).json({ error: 'Validation impossible : photo ' + missing.join(' et photo ') + ' manquante.' });
  }

  let articles;
  try { articles = JSON.parse(fiche.articles_json || '[]'); } catch (e) { articles = []; }
  if (!articles || !articles.length) return res.status(400).json({ error: 'Aucun article enregistre sur cette entree.' });

  try {
    const transaction = db.transaction(() => {
      const insertLigne = db.prepare(`
        INSERT INTO fiche_entree_articles (fiche_id, article_id, quantite, numero_debut, numero_fin, observation)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertMvt = db.prepare(`
        INSERT INTO mouvements (article_id, type, quantite, motif, user_id, fournisseur_id, entree_id, numero_debut, numero_fin, date)
        VALUES (?, 'entree', ?, 'Entree fournisseur — ' || ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `);
      const updateStock = db.prepare(`
        UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime('now','localtime') WHERE id = ?
      `);

      for (const art of articles) {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.article_id);
        if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');
        const qte = parseInt(art.quantite, 10);
        if (isNaN(qte) || qte <= 0) throw new Error('Quantite invalide pour ' + (article.nom || 'article #' + art.article_id) + '.');

        if (article.type_article === 'numerote') {
          if (parseNumero(art.numero_debut) === null || parseNumero(art.numero_fin) === null) {
            throw new Error('La plage de numeros (debut-fin) est requise pour un article numerote : ' + article.nom + '.');
          }
          const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'entree');
          if (overlap) throw new Error('Chevauchement pour ' + article.nom + ' : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
          recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, qte, 'entree', req.params.id);
        }

        insertLigne.run(req.params.id, art.article_id, qte, art.numero_debut || null, art.numero_fin || null, art.observation || null);
        insertMvt.run(art.article_id, qte, fiche.reference, req.user.id, fiche.fournisseur_id || null, req.params.id, art.numero_debut || null, art.numero_fin || null);
        updateStock.run(qte, art.article_id);
      }

      db.prepare("UPDATE fiches_entree SET validee = 1, statut = 'validee', updated_at = datetime('now','localtime') WHERE id = ?").run(req.params.id);
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  const ficheUpdated = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  const lignes = db.prepare(`
    SELECT fea.*, a.nom as article_nom, a.unite FROM fiche_entree_articles fea
    LEFT JOIN articles a ON fea.article_id = a.id WHERE fea.fiche_id = ?
  `).all(req.params.id);
  logAudit(db, req.user.id, req.user.username, 'VALIDER_ENTREE', fiche.reference || String(req.params.id));
  res.json({ fiche: ficheUpdated, lignes, message: 'Entree validee et stock mis a jour.' });
});

// POST /api/entrees/:id/photos — upload photo bon de livraison / facture
router.post('/:id/photos', authenticate, upload, (req, res) => {
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
  logAudit(db, req.user.id, req.user.username, 'PHOTO_ENTREE', 'Fiche ' + (fiche.reference || req.params.id) + ' — ' + type);
  res.status(201).json({ photo });
});

// DELETE /api/entrees/:id (admin seulement)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });

  // Recuperer les photos AVANT la suppression : la fiche les supprime en cascade en base,
  // il faut donc lister les chemins avant pour pouvoir les nettoyer sur disque.
  const photos = db.prepare('SELECT * FROM fiche_entree_photos WHERE fiche_id = ?').all(req.params.id);
  const uploadsDir = require('../services/paths').uploadDir;
  const removePhotos = function() {
    for (const p of photos) {
      const full = path.resolve(uploadsDir, String(p.fichier_path).replace(/^\/uploads\//, ''));
      if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch (e) { /* deja supprime */ } }
    }
  };

  // Brouillon (validee=0) : aucun stock n'a ete ajoute, on supprime sans ajuster le stock
  if (fiche.validee === 0) {
    db.prepare('DELETE FROM fiches_entree WHERE id = ?').run(req.params.id);
    logAudit(db, req.user.id, req.user.username, 'SUPPR_ENTREE', (fiche.reference || String(req.params.id)) + ' (brouillon)');
    removePhotos();
    return res.json({ message: 'Brouillon supprime (aucun stock ajuste).' });
  }

  const lignes = db.prepare('SELECT * FROM fiche_entree_articles WHERE fiche_id = ?').all(req.params.id);

  // Agreger les quantites par article AVANT la garde : evite les stocks negatifs
  // quand une fiche a plusieurs lignes du meme article (ex. stock 3, deux lignes de 2).
  const totals = {};
  for (const l of lignes) {
    totals[l.article_id] = (totals[l.article_id] || 0) + l.quantite;
  }
  for (const article_id of Object.keys(totals)) {
    const article = db.prepare('SELECT stock_actuel FROM articles WHERE id = ?').get(article_id);
    if (article && article.stock_actuel < totals[article_id]) {
      return res.status(400).json({
        error: 'Suppression impossible : stock article #' + article_id + ' (' + article.stock_actuel + ') inferieur a la quantite de l entree (' + totals[article_id] + '). Des sorties ont eu lieu.'
      });
    }
  }

  const transaction = db.transaction(() => {
    for (const l of lignes) {
      db.prepare('UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(l.quantite, l.article_id);
    }
    db.prepare("DELETE FROM series_numeros WHERE source_type = 'entree' AND source_id = ?").run(req.params.id);
    db.prepare('DELETE FROM mouvements WHERE entree_id = ?').run(req.params.id);
    db.prepare('DELETE FROM fiches_entree WHERE id = ?').run(req.params.id);
  });
  transaction();
  logAudit(db, req.user.id, req.user.username, 'SUPPR_ENTREE', fiche.reference || String(req.params.id));
  removePhotos();

  res.json({ message: 'Entree supprimee (stock ajuste).' });
});

module.exports = router;
