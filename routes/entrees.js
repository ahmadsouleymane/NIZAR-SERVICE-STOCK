// routes/entrees.js — Entrees fournisseur (enregistrement sans impression)
const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkOverlap, recordSerie, parseNumero, validerSouche, quantiteDepuisSouche } = require('../services/series');
const { createUpload } = require('../services/uploads');
const { logAudit } = require('../services/audit');
const router = express.Router();

const [upload, verifyUpload] = createUpload('photo');

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

// Construit les lignes { article_nom, quantite, numero_debut, numero_fin, unite } pour le PDF,
// depuis articles_json (brouillon, avant validation) ou fiche_entree_articles (apres validation).
function buildLignesForPDF(db, fiche) {
  if (fiche.validee) {
    return db.prepare(`
      SELECT fea.quantite, fea.numero_debut, fea.numero_fin, a.nom as article_nom,
        COALESCE((SELECT label FROM unites WHERE code = a.unite), a.unite) as unite
      FROM fiche_entree_articles fea LEFT JOIN articles a ON fea.article_id = a.id
      WHERE fea.fiche_id = ?
    `).all(fiche.id);
  }
  let articles;
  try { articles = JSON.parse(fiche.articles_json || '[]'); } catch (e) { articles = []; }
  return articles.map(function(art) {
    const a = db.prepare(`
      SELECT art2.nom as nom, COALESCE((SELECT label FROM unites WHERE code = art2.unite), art2.unite) as unite_label
      FROM articles art2 WHERE art2.id = ?
    `).get(art.article_id);
    return {
      quantite: art.quantite,
      numero_debut: art.numero_debut || null,
      numero_fin: art.numero_fin || null,
      article_nom: a ? a.nom : ('Article #' + art.article_id),
      unite: a ? a.unite_label : ''
    };
  });
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

// POST /api/entrees/:id/bon-livraison — genere (ou regenere) le PDF quand le
// fournisseur n'a transmis aucun bon de livraison papier
router.post('/:id/bon-livraison', authenticate, async (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id WHERE fe.id = ?
  `).get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });

  const lignes = buildLignesForPDF(db, fiche);
  if (!lignes.length) return res.status(400).json({ error: 'Aucun article sur cette entree : impossible de generer le bon de livraison.' });

  try {
    const { generateBonLivraisonPDF } = require('../services/pdf');
    const pdfPath = await generateBonLivraisonPDF(fiche, lignes);
    db.prepare('UPDATE fiches_entree SET fichier_path = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(pdfPath, req.params.id);
    logAudit(db, req.user.id, req.user.username, 'GENERER_BL', fiche.reference || String(req.params.id));
    res.json({ fichier_path: pdfPath, message: 'Bon de livraison genere.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur generation PDF: ' + err.message });
  }
});

// GET /api/entrees/:id/pdf — telecharger/re-imprimer le bon de livraison. Toujours
// regenere a partir des donnees actuelles (fournisseur, unite...), jamais de version figee.
router.get('/:id/pdf', authenticate, async (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id WHERE fe.id = ?
  `).get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });
  if (!fiche.fichier_path) return res.status(404).json({ error: "Aucun bon de livraison genere pour cette entree." });

  const lignes = buildLignesForPDF(db, fiche);
  const uploadsDir = require('../services/paths').uploadDir;
  const ancienFichier = fiche.fichier_path;

  try {
    const { generateBonLivraisonPDF } = require('../services/pdf');
    const pdfPath = await generateBonLivraisonPDF(fiche, lignes);
    db.prepare('UPDATE fiches_entree SET fichier_path = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(pdfPath, req.params.id);
    if (ancienFichier && ancienFichier !== pdfPath) {
      const ancienFull = path.resolve(uploadsDir, String(ancienFichier).replace(/^\/uploads\//, ''));
      if (fs.existsSync(ancienFull)) { try { fs.unlinkSync(ancienFull); } catch (e) { /* deja supprime */ } }
    }
    const fullPath = path.resolve(uploadsDir, String(pdfPath).replace(/^\/uploads\//, ''));
    res.download(fullPath);
  } catch (err) {
    res.status(500).json({ error: 'Erreur generation PDF: ' + err.message });
  }
});

// POST /api/entrees — creer un brouillon d'entree (stock NON incremente avant validation)
// Les articles saisis sont conserves dans articles_json et lus a la validation.
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { fournisseur_id, numero_bl, numero_facture, numero_fiche_besoin, notes, articles } = req.body;

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
        INSERT INTO fiches_entree (reference, fournisseur_id, date_entree, numero_bl, numero_facture, numero_fiche_besoin, notes, user_id, statut, validee, articles_json)
        VALUES (?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, 'validee', 0, ?)
      `).run(reference, fournisseur_id || null, numero_bl || null, numero_facture || null, numero_fiche_besoin || null, notes || null, req.user.id, JSON.stringify(articles));
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

  // Bon de livraison : photo fournisseur OU PDF genere par l'app. Facture : photo obligatoire (inchange).
  const hasPhotoBL = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'bl'").get(req.params.id).c > 0;
  const hasFacture = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'facture'").get(req.params.id).c > 0;
  const hasBL = hasPhotoBL || !!fiche.fichier_path;
  if (!hasBL || !hasFacture) {
    const missing = [];
    if (!hasBL) missing.push('bon de livraison (photo ou generation)');
    if (!hasFacture) missing.push('facture');
    return res.status(400).json({ error: 'Validation impossible : ' + missing.join(' et ') + ' manquant.' });
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
        const article = db.prepare(`
          SELECT a.*, c.souches_par_unite AS lot
          FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id WHERE a.id = ?
        `).get(art.article_id);
        if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');
        let qte = parseInt(art.quantite, 10);

        if (article.type_article === 'numerote') {
          const v = validerSouche(article.lot, art.numero_debut, art.numero_fin);
          if (!v.ok) throw new Error(v.raison + ' — ' + article.nom);
          if (article.lot) qte = quantiteDepuisSouche(article.lot, art.numero_debut, art.numero_fin);
          const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'entree');
          if (overlap) throw new Error('Chevauchement pour ' + article.nom + ' : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
          recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, qte, 'entree', req.params.id);
        }
        if (isNaN(qte) || qte <= 0) throw new Error('Quantite invalide pour ' + (article.nom || 'article #' + art.article_id) + '.');

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
router.post('/:id/photos', authenticate, upload, verifyUpload, (req, res) => {
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

// PUT /api/entrees/:id — modifier une entree deja creee (admin seulement).
// Brouillon (validee=0) : simple mise a jour des champs et de la liste d'articles
// (rien n'a encore ete applique au stock). Entree validee (validee=1) : annule
// l'effet stock des anciennes lignes puis applique le nouveau contenu.
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { fournisseur_id, numero_bl, numero_facture, numero_fiche_besoin, notes, articles } = req.body;

  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });
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

  const ficheId = req.params.id;

  try {
    const transaction = db.transaction(() => {
      if (fiche.validee === 0) {
        // Brouillon : rien n'a ete applique au stock, on remplace juste la liste prevue.
        db.prepare(`
          UPDATE fiches_entree SET fournisseur_id = ?, numero_bl = ?, numero_facture = ?,
            numero_fiche_besoin = ?, notes = ?, articles_json = ?, updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(fournisseur_id || null, numero_bl || null, numero_facture || null, numero_fiche_besoin || null, notes || null, JSON.stringify(articles), ficheId);
        return;
      }

      // Entree deja validee : annuler l'effet stock des anciennes lignes puis reappliquer.
      const anciennesLignes = db.prepare('SELECT article_id, quantite FROM fiche_entree_articles WHERE fiche_id = ?').all(ficheId);
      const restoreStock = db.prepare("UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime('now','localtime') WHERE id = ?");
      for (const l of anciennesLignes) {
        const article = db.prepare('SELECT nom, stock_actuel FROM articles WHERE id = ?').get(l.article_id);
        if (article && article.stock_actuel < l.quantite) {
          throw new Error('Impossible de modifier : du stock de ' + article.nom + ' a deja ete consomme depuis cette entree.');
        }
        restoreStock.run(l.quantite, l.article_id);
      }

      db.prepare('DELETE FROM mouvements WHERE entree_id = ?').run(ficheId);
      db.prepare("DELETE FROM series_numeros WHERE source_type = 'entree' AND source_id = ?").run(ficheId);
      db.prepare('DELETE FROM fiche_entree_articles WHERE fiche_id = ?').run(ficheId);

      const insertLigne = db.prepare(`
        INSERT INTO fiche_entree_articles (fiche_id, article_id, quantite, numero_debut, numero_fin, observation)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertMvt = db.prepare(`
        INSERT INTO mouvements (article_id, type, quantite, motif, user_id, fournisseur_id, entree_id, numero_debut, numero_fin, date)
        VALUES (?, 'entree', ?, 'Entree fournisseur (modifiee) — ' || ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
      `);
      const updateStock = db.prepare("UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime('now','localtime') WHERE id = ?");

      for (const art of articles) {
        const article = db.prepare(`
          SELECT a.*, c.souches_par_unite AS lot
          FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id WHERE a.id = ?
        `).get(art.article_id);
        if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');

        if (article.type_article === 'numerote') {
          const v = validerSouche(article.lot, art.numero_debut, art.numero_fin);
          if (!v.ok) throw new Error(v.raison + ' — ' + article.nom);
          if (article.lot) art.quantite = quantiteDepuisSouche(article.lot, art.numero_debut, art.numero_fin);
          const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'entree');
          if (overlap) throw new Error('Chevauchement pour ' + article.nom + ' : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
          recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'entree', ficheId);
        }

        insertLigne.run(ficheId, art.article_id, art.quantite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
        insertMvt.run(art.article_id, art.quantite, fiche.reference, req.user.id, fournisseur_id || null, ficheId, art.numero_debut || null, art.numero_fin || null);
        updateStock.run(art.quantite, art.article_id);
      }

      db.prepare(`
        UPDATE fiches_entree SET fournisseur_id = ?, numero_bl = ?, numero_facture = ?,
          numero_fiche_besoin = ?, notes = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(fournisseur_id || null, numero_bl || null, numero_facture || null, numero_fiche_besoin || null, notes || null, ficheId);
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  const ficheMaj = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(ficheId);
  const lignes = fiche.validee === 1
    ? db.prepare(`
        SELECT fea.*, a.nom as article_nom, a.unite FROM fiche_entree_articles fea
        LEFT JOIN articles a ON fea.article_id = a.id WHERE fea.fiche_id = ?
      `).all(ficheId)
    : articles;

  logAudit(db, req.user.id, req.user.username, 'MODIF_ENTREE', fiche.reference || String(ficheId));
  res.json({ fiche: ficheMaj, lignes, message: 'Entree modifiee.' });
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
