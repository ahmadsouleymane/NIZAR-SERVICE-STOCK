// routes/fiches_reception.js — Fiches de reception + generation PDF auto
const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { generateFichePDF } = require('../services/pdf');
const { checkOverlap, recordSerie, parseNumero, validerSouche, quantiteDepuisSouche } = require('../services/series');
const { createUpload } = require('../services/uploads');
const { logAudit } = require('../services/audit');
const router = express.Router();

const [upload, verifyUpload] = createUpload('scan');

function generateRef(db) {
  // Reference basee sur la sequence autoincrement : jamais reutilisee, donc pas de collision
  // (meme apres une suppression, contrairement a un simple compteur).
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'fiches_reception'").get();
  const next = (seq ? seq.seq : 0) + 1;
  return 'BR-' + String(next).padStart(3, '0') + '-' + y + m;
}

// GET /api/fiches — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { statut, localite_id, debut, fin, offset, search } = req.query;

  let query = `
    SELECT fr.*, l.nom as localite_nom, l.est_service as localite_service, u.username as cree_par,
      (SELECT COUNT(*) FROM fiche_reception_articles WHERE fiche_id = fr.id) as nb_lignes
    FROM fiches_reception fr
    LEFT JOIN localites l ON fr.localite_id = l.id
    LEFT JOIN users u ON fr.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (statut) { query += ' AND fr.statut = ?'; params.push(statut); }
  if (localite_id) { query += ' AND fr.localite_id = ?'; params.push(localite_id); }
  if (debut) { query += ' AND fr.date_creation >= ?'; params.push(debut); }
  if (fin) { query += ' AND fr.date_creation <= ?'; params.push(fin + ' 23:59:59'); }
  // Recherche libre : reference, n° facture, ou nom de destination.
  if (search && String(search).trim()) {
    const s = '%' + String(search).trim() + '%';
    query += ' AND (fr.reference LIKE ? OR fr.numero_facture LIKE ? OR l.nom LIKE ?)';
    params.push(s, s, s);
  }

  const limit = 50;
  const off = parseInt(offset, 10) || 0;
  query += ' ORDER BY fr.id DESC LIMIT ? OFFSET ?';
  const fiches = db.prepare(query).all(...params, limit, off);
  res.json({ fiches });
});

// GET /api/fiches/:id — detail
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays, l.est_service as localite_service, u.username as cree_par
    FROM fiches_reception fr
    LEFT JOIN localites l ON fr.localite_id = l.id
    LEFT JOIN users u ON fr.user_id = u.id
    WHERE fr.id = ?
  `).get(req.params.id);

  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  const lignes = db.prepare(`
    SELECT fra.*, a.nom as article_nom, a.reference, COALESCE((SELECT label FROM unites WHERE code = COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite)), NULLIF(TRIM(fra.unite), ''), a.unite) as unite, a.type_article,
      (SELECT souches_par_unite FROM categories WHERE id = a.categorie_id) as souches_par_unite
    FROM fiche_reception_articles fra
    LEFT JOIN articles a ON fra.article_id = a.id
    WHERE fra.fiche_id = ?
  `).all(req.params.id);

  res.json({ fiche, lignes });
});

// POST /api/fiches — creer un envoi + generer le PDF automatiquement
router.post('/', authenticate, async (req, res) => {
  const db = req.db;
  const { localite_id, articles, notes, date_envoi } = req.body;

  // Date d'envoi : si l'utilisateur fournit une date (sorties historiques),
  // on la conserve ; sinon date/heure reelle du moment (jour, mois, annee, heure).
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const nowStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  const dateEffective = (date_envoi && !isNaN(new Date(date_envoi).getTime()))
    ? date_envoi + ' 00:00:00'
    : nowStr;

  if (!localite_id) return res.status(400).json({ error: 'Destination requise.' });
  if (!articles || !articles.length) return res.status(400).json({ error: 'Au moins un article requis.' });

  // Verifier que la localite existe
  const localite = db.prepare('SELECT id FROM localites WHERE id = ?').get(localite_id);
  if (!localite) return res.status(400).json({ error: 'Destination introuvable.' });

  // Valider les articles
  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const qte = parseInt(art.quantite, 10);
    if (isNaN(qte) || qte <= 0) {
      return res.status(400).json({ error: 'Quantite invalide pour la ligne ' + (i + 1) + ' (doit etre > 0).' });
    }
    articles[i].quantite = qte; // Normaliser
  }

  const reference = generateRef(db);
  let ficheId = null;

  // Transaction DB
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO fiches_reception (reference, localite_id, user_id, statut, notes, date_envoi)
      VALUES (?, ?, ?, 'envoyee', ?, ?)
    `).run(reference, localite_id, req.user.id, notes || null, dateEffective);

    ficheId = result.lastInsertRowid;

    // Numero de facture stable et unique : base sur l'id autoincrement (jamais reutilise)
    const numeroFacture = 'FACT-' + new Date().getFullYear() + '-' + String(ficheId).padStart(5, '0');
    db.prepare('UPDATE fiches_reception SET numero_facture = ? WHERE id = ?').run(numeroFacture, ficheId);

    const insertLigne = db.prepare(`
      INSERT INTO fiche_reception_articles (fiche_id, article_id, quantite, unite, numero_debut, numero_fin, observation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMvt = db.prepare(`
      INSERT INTO mouvements (article_id, type, quantite, motif, user_id, localite_id, fiche_id, demandeur, date)
      VALUES (?, 'sortie', ?, 'Envoi — Fiche ' || ?, ?, ?, ?, ?, ?)
    `);
    const updateStock = db.prepare(`
      UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime('now','localtime') WHERE id = ?
    `);

    for (const art of articles) {
      const article = db.prepare(`
        SELECT a.*, c.souches_par_unite AS lot
        FROM articles a LEFT JOIN categories c ON a.categorie_id = c.id WHERE a.id = ?
      `).get(art.article_id);
      if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');

      // Article numerote : validation stricte de la plage de souches et, si la
      // categorie a une taille de lot, quantite CALCULEE cote serveur (source de
      // verite) = (fin - debut + 1) / taille_de_lot.
      if (article.type_article === 'numerote') {
        const v = validerSouche(article.lot, art.numero_debut, art.numero_fin);
        if (!v.ok) throw new Error(v.raison + ' — ' + article.nom);
        if (article.lot) art.quantite = quantiteDepuisSouche(article.lot, art.numero_debut, art.numero_fin);
      }

      // Garde-fou : jamais de stock negatif. Bloquant pour tous les roles (un test
      // recent a laisse un article passer a -10 avant ce controle).
      if (article.stock_actuel < art.quantite) {
        throw new Error('Stock insuffisant pour ' + article.nom + ' : ' + article.stock_actuel + ' ' + (article.unite || '') + ' disponible(s), ' + art.quantite + ' demande(s).');
      }

      if (article.type_article === 'numerote') {
        const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'sortie',
          { localite_id: localite_id, perLocalite: !!article.souche_par_localite });
        if (overlap) throw new Error('Chevauchement : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja envoyee (' + overlap.numero_debut + '-' + overlap.numero_fin + ')' + (article.souche_par_localite ? ' sur cette localite' : '') + '.');
        recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'sortie', ficheId);
      }

      const unite = (art.unite || '').trim() || (article.unite || '').trim();
      insertLigne.run(ficheId, art.article_id, art.quantite, unite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
      insertMvt.run(art.article_id, art.quantite, reference, req.user.id, localite_id, ficheId, null, dateEffective);
      updateStock.run(art.quantite, art.article_id);
    }
  });

  try {
    transaction();

    // Recuperer la fiche creee avec les infos pour le PDF
    const fiche = db.prepare(`
      SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays, l.est_service as localite_service
      FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
    `).get(ficheId);

    const lignes = db.prepare(`
      SELECT fra.*, a.nom as article_nom, COALESCE((SELECT label FROM unites WHERE code = COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite)), NULLIF(TRIM(fra.unite), ''), a.unite) as unite
      FROM fiche_reception_articles fra LEFT JOIN articles a ON fra.article_id = a.id WHERE fra.fiche_id = ?
    `).all(ficheId);

    // Generer le PDF
    try {
      const pdfPath = await generateFichePDF(fiche, lignes);
      db.prepare('UPDATE fiches_reception SET fichier_path = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(pdfPath, ficheId);
      fiche.fichier_path = pdfPath;
    } catch (pdfErr) {
      console.error('Erreur generation PDF:', pdfErr.message);
      // On continue meme si le PDF echoue
    }

    logAudit(db, req.user.id, req.user.username, 'CREER_FICHE', 'Sortie ' + reference + ' — ' + (localite.nom || ''));
    res.status(201).json({ fiche, lignes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/fiches/:id — modifier une sortie deja creee (admin seulement) : articles,
// quantites, destination, notes. Annule l'effet stock des anciennes lignes puis
// applique le nouveau contenu (comme une re-creation), regenere le PDF.
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const db = req.db;
  const { localite_id, articles, notes } = req.body;

  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });
  if (!localite_id) return res.status(400).json({ error: 'Destination requise.' });
  if (!articles || !articles.length) return res.status(400).json({ error: 'Au moins un article requis.' });

  const localite = db.prepare('SELECT id, nom FROM localites WHERE id = ?').get(localite_id);
  if (!localite) return res.status(400).json({ error: 'Destination introuvable.' });

  for (let i = 0; i < articles.length; i++) {
    const qte = parseInt(articles[i].quantite, 10);
    if (isNaN(qte) || qte <= 0) {
      return res.status(400).json({ error: 'Quantite invalide pour la ligne ' + (i + 1) + ' (doit etre > 0).' });
    }
    articles[i].quantite = qte;
  }

  const ficheId = fiche.id;

  const transaction = db.transaction(() => {
    // 1. Annuler l'effet stock des anciennes lignes (une sortie retiree redonne le stock)
    const anciennesLignes = db.prepare('SELECT article_id, quantite FROM fiche_reception_articles WHERE fiche_id = ?').all(ficheId);
    const restoreStock = db.prepare("UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime('now','localtime') WHERE id = ?");
    for (const l of anciennesLignes) restoreStock.run(l.quantite, l.article_id);

    db.prepare('DELETE FROM mouvements WHERE fiche_id = ?').run(ficheId);
    db.prepare("DELETE FROM series_numeros WHERE source_type = 'sortie' AND source_id = ?").run(ficheId);
    db.prepare('DELETE FROM fiche_reception_articles WHERE fiche_id = ?').run(ficheId);

    // 2. Appliquer le nouveau contenu (meme logique que la creation)
    const insertLigne = db.prepare(`
      INSERT INTO fiche_reception_articles (fiche_id, article_id, quantite, unite, numero_debut, numero_fin, observation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMvt = db.prepare(`
      INSERT INTO mouvements (article_id, type, quantite, motif, user_id, localite_id, fiche_id, demandeur, date)
      VALUES (?, 'sortie', ?, 'Envoi (modifie) — Fiche ' || ?, ?, ?, ?, ?, datetime('now','localtime'))
    `);
    const updateStock = db.prepare("UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime('now','localtime') WHERE id = ?");

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
      }

      if (article.stock_actuel < art.quantite) {
        throw new Error('Stock insuffisant pour ' + article.nom + ' : ' + article.stock_actuel + ' ' + (article.unite || '') + ' disponible(s), ' + art.quantite + ' demande(s).');
      }

      if (article.type_article === 'numerote') {
        const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'sortie',
          { localite_id: localite_id, perLocalite: !!article.souche_par_localite });
        if (overlap) throw new Error('Chevauchement : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja envoyee (' + overlap.numero_debut + '-' + overlap.numero_fin + ')' + (article.souche_par_localite ? ' sur cette localite' : '') + '.');
        recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'sortie', ficheId);
      }

      const unite = (art.unite || '').trim() || (article.unite || '').trim();
      insertLigne.run(ficheId, art.article_id, art.quantite, unite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
      insertMvt.run(art.article_id, art.quantite, fiche.reference, req.user.id, localite_id, ficheId, null);
      updateStock.run(art.quantite, art.article_id);
    }

    db.prepare("UPDATE fiches_reception SET localite_id = ?, notes = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(localite_id, notes || null, ficheId);
  });

  try {
    transaction();

    const ficheMaj = db.prepare(`
      SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays, l.est_service as localite_service
      FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
    `).get(ficheId);
    const lignes = db.prepare(`
      SELECT fra.*, a.nom as article_nom, COALESCE((SELECT label FROM unites WHERE code = COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite)), NULLIF(TRIM(fra.unite), ''), a.unite) as unite
      FROM fiche_reception_articles fra LEFT JOIN articles a ON fra.article_id = a.id WHERE fra.fiche_id = ?
    `).all(ficheId);

    try {
      const pdfPath = await generateFichePDF(ficheMaj, lignes);
      db.prepare("UPDATE fiches_reception SET fichier_path = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(pdfPath, ficheId);
      ficheMaj.fichier_path = pdfPath;
    } catch (pdfErr) {
      console.error('Erreur generation PDF:', pdfErr.message);
    }

    logAudit(db, req.user.id, req.user.username, 'MODIF_FICHE', 'Sortie ' + fiche.reference + ' — ' + (localite.nom || ''));
    res.json({ fiche: ficheMaj, lignes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/fiches/:id/pdf — telecharger le PDF. Toujours regenere a partir des
// donnees actuelles (article, unite, destination...) : jamais de version figee
// dans le temps, meme pour une fiche deja envoyee.
router.get('/:id/pdf', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  const lignes = db.prepare(`
    SELECT fra.*, a.nom as article_nom, COALESCE((SELECT label FROM unites WHERE code = COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite)), NULLIF(TRIM(fra.unite), ''), a.unite) as unite
    FROM fiche_reception_articles fra LEFT JOIN articles a ON fra.article_id = a.id WHERE fra.fiche_id = ?
  `).all(req.params.id);

  const ficheInfo = db.prepare(`
    SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays, l.est_service as localite_service
    FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);

  const uploadsDir = require('../services/paths').uploadDir;
  const ancienFichier = fiche.fichier_path;
  generateFichePDF(ficheInfo, lignes)
    .then(pdfPath => {
      db.prepare("UPDATE fiches_reception SET fichier_path = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(pdfPath, req.params.id);
      if (ancienFichier && ancienFichier !== pdfPath) {
        const ancienFull = path.resolve(uploadsDir, String(ancienFichier).replace(/^\/uploads\//, ''));
        if (fs.existsSync(ancienFull)) { try { fs.unlinkSync(ancienFull); } catch (e) { /* deja supprime */ } }
      }
      const fullPath = path.resolve(uploadsDir, String(pdfPath).replace(/^\/uploads\//, ''));
      res.download(fullPath);
    })
    .catch(err => res.status(500).json({ error: 'Erreur generation PDF: ' + err.message }));
});

// POST /api/fiches/:id/imprimer — impression A4 (N'archive PAS : le statut suit le
// pipeline envoye -> retourne (photo) -> archive, décidé par le gestionnaire).
router.post('/:id/imprimer', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  logAudit(db, req.user.id, req.user.username, 'IMPRIMER_FICHE', fiche.reference || String(req.params.id));

  const updated = db.prepare(`
    SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);
  res.json({ fiche: updated, message: 'Fiche prête pour impression.' });
});

// PATCH /api/fiches/:id/statut — changer statut (pipeline envoye -> retourne -> archive)
router.patch('/:id/statut', authenticate, (req, res) => {
  const db = req.db;
  const { statut } = req.body;
  if (!['retournee', 'archivee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide (retournee ou archivee).' });
  }

  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  // « retournee » ne peut venir que d'une fiche « envoyee » AVEC photo (le scan EST le retour).
  if (statut === 'retournee') {
    if (fiche.statut !== 'envoyee') {
      return res.status(400).json({ error: 'Seule une fiche envoyée peut être marquée retournée.' });
    }
    if (!fiche.scan_path) {
      return res.status(400).json({ error: 'Photo requise pour le retour : scannez d\'abord le document.' });
    }
  }

  // « archivee » ne peut venir que d'une fiche « retournee » (retour avec photo fait).
  if (statut === 'archivee' && fiche.statut !== 'retournee') {
    return res.status(400).json({ error: 'Marquez d\'abord le retour (avec photo) avant d\'archiver.' });
  }

  db.prepare('UPDATE fiches_reception SET statut = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(statut, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'STATUT_FICHE', 'Fiche ' + (fiche.reference || req.params.id) + ' -> ' + statut);

  const updated = db.prepare(`
    SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);
  res.json({ fiche: updated, message: 'Statut mis a jour : ' + statut });
});

// POST /api/fiches/:id/upload — photo du retour (obligatoire) : marque la fiche « retournee ».
// Fiche deja « archivee » (import historique ou retour ajoute apres coup) : la
// photo est simplement attachee, le statut reste « archivee » (pas de retour en arriere).
router.post('/:id/upload', authenticate, upload, verifyUpload, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Photo du retour requise.' });

  const scanPath = '/uploads/' + req.file.filename;
  const nouveauStatut = fiche.statut === 'archivee' ? 'archivee' : 'retournee';
  // Le PDF original (fichier_path) reste intact et re-imprimable a volonte.
  db.prepare('UPDATE fiches_reception SET scan_path = ?, statut = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(scanPath, nouveauStatut, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'SCAN_FICHE', 'Photo du retour enregistree pour ' + (fiche.reference || req.params.id));

  const updated = db.prepare(`
    SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);

  res.json({
    fiche: updated,
    message: nouveauStatut === 'archivee' ? 'Photo du retour ajoutee.' : 'Retour enregistré (photo). La fiche est passée en « retournée ».'
  });
});

// DELETE /api/fiches/:id (admin seulement)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  const lignes = db.prepare('SELECT * FROM fiche_reception_articles WHERE fiche_id = ?').all(req.params.id);

  const transaction = db.transaction(() => {
    // Restaurer le stock : la sortie etait une diminution, on la rend au stock
    const updateStock = db.prepare('UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?');
    for (const l of lignes) updateStock.run(l.quantite, l.article_id);
    // Supprimer les mouvements lies
    db.prepare('DELETE FROM mouvements WHERE fiche_id = ?').run(req.params.id);
    // Supprimer les numeros de souche lies a cette sortie
    db.prepare("DELETE FROM series_numeros WHERE source_type = 'sortie' AND source_id = ?").run(req.params.id);
    // Supprimer les lignes de la fiche
    db.prepare('DELETE FROM fiche_reception_articles WHERE fiche_id = ?').run(req.params.id);
    // Supprimer la fiche
    db.prepare('DELETE FROM fiches_reception WHERE id = ?').run(req.params.id);
  });

  transaction();
  logAudit(db, req.user.id, req.user.username, 'SUPPR_FICHE', fiche.reference || String(req.params.id));

  // Nettoyer les fichiers sur disque (PDF original + scan signe) pour eviter les orphelins
  const uploadsDir = require('../services/paths').uploadDir;
  const filesToRemove = [fiche.fichier_path, fiche.scan_path];
  for (const f of filesToRemove) {
    if (!f) continue;
    const full = path.resolve(uploadsDir, String(f).replace(/^\/uploads\//, ''));
    if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch (e) { /* fichier deja supprime */ } }
  }

  res.json({ message: 'Fiche supprimee.' });
});

module.exports = router;
