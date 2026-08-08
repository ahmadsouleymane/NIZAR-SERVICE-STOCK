// routes/fiches_reception.js — Fiches de reception + generation PDF auto
const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { generateFichePDF } = require('../services/pdf');
const { checkOverlap, recordSerie, parseNumero } = require('../services/series');
const { createUpload } = require('../services/uploads');
const { logAudit } = require('../services/audit');
const router = express.Router();

const upload = createUpload('scan');

function generateRef(db) {
  // Reference basee sur la sequence autoincrement : jamais reutilisee, donc pas de collision
  // (meme apres une suppression, contrairement a un simple compteur).
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'fiches_reception'").get();
  const next = (seq ? seq.seq : 0) + 1;
  return 'FR-' + y + m + '-' + String(next).padStart(3, '0');
}

// GET /api/fiches — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { statut, localite_id, debut, fin, offset } = req.query;

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
    SELECT fra.*, a.nom as article_nom, a.reference, COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite) as unite, a.type_article
    FROM fiche_reception_articles fra
    LEFT JOIN articles a ON fra.article_id = a.id
    WHERE fra.fiche_id = ?
  `).all(req.params.id);

  res.json({ fiche, lignes });
});

// POST /api/fiches — creer un envoi + generer le PDF automatiquement
router.post('/', authenticate, async (req, res) => {
  const db = req.db;
  const { localite_id, articles, notes } = req.body;

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
      VALUES (?, ?, ?, 'envoyee', ?, datetime('now','localtime'))
    `).run(reference, localite_id, req.user.id, notes || null);

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
      VALUES (?, 'sortie', ?, 'Envoi — Fiche ' || ?, ?, ?, ?, ?, datetime('now','localtime'))
    `);
    const updateStock = db.prepare(`
      UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime('now','localtime') WHERE id = ?
    `);

    for (const art of articles) {
      const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.article_id);
      if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');
      // Pas de contrôle de stock : le gestionnaire enregistre les sorties même si le
      // stock théorique est à 0 (le stock réel est géré à part).

      if (article.type_article === 'numerote') {
        if (parseNumero(art.numero_debut) === null || parseNumero(art.numero_fin) === null) {
          throw new Error('La plage de numeros (debut-fin) est requise pour un article numerote : ' + article.nom + '.');
        }
        const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'sortie');
        if (overlap) throw new Error('Chevauchement : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja envoyee (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
        recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'sortie', ficheId);
      }

      const unite = (art.unite || '').trim() || (article.unite || '').trim();
      insertLigne.run(ficheId, art.article_id, art.quantite, unite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
      insertMvt.run(art.article_id, art.quantite, reference, req.user.id, localite_id, ficheId, null);
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
      SELECT fra.*, a.nom as article_nom, COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite) as unite
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

// GET /api/fiches/:id/pdf — telecharger le PDF
router.get('/:id/pdf', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  // Si on a un fichier_path, le servir
  if (fiche.fichier_path) {
    const fullPath = path.join(__dirname, '..', 'public', fiche.fichier_path);
    if (fs.existsSync(fullPath)) {
      return res.download(fullPath);
    }
  }

  // Sinon regenerer le PDF
  const lignes = db.prepare(`
    SELECT fra.*, a.nom as article_nom, COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite) as unite
    FROM fiche_reception_articles fra LEFT JOIN articles a ON fra.article_id = a.id WHERE fra.fiche_id = ?
  `).all(req.params.id);

  const ficheInfo = db.prepare(`
    SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays, l.est_service as localite_service
    FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);

  generateFichePDF(ficheInfo, lignes)
    .then(pdfPath => {
      db.prepare('UPDATE fiches_reception SET fichier_path = ? WHERE id = ?').run(pdfPath, req.params.id);
      const fullPath = path.join(__dirname, '..', 'public', pdfPath);
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

// POST /api/fiches/:id/upload — photo du retour (obligatoire) : marque la fiche « retournee »
router.post('/:id/upload', authenticate, upload, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Photo du retour requise.' });
  if (fiche.statut === 'archivee') return res.status(400).json({ error: 'Fiche déjà archivée.' });

  const scanPath = '/uploads/' + req.file.filename;
  // La photo remplace la signature : la fiche passe en « retournee ».
  // Le PDF original (fichier_path) reste intact et re-imprimable a volonte.
  db.prepare('UPDATE fiches_reception SET scan_path = ?, statut = \'retournee\', updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
    .run(scanPath, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'SCAN_FICHE', 'Photo du retour enregistree pour ' + (fiche.reference || req.params.id));

  const updated = db.prepare(`
    SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);

  res.json({ fiche: updated, message: 'Retour enregistré (photo). La fiche est passée en « retournée ».' });
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
