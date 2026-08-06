// routes/fiches_reception.js — Fiches de reception + generation PDF auto
const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { generateFichePDF } = require('../services/pdf');
const { checkOverlap, recordSerie, parseNumero } = require('../services/series');
const { createUpload } = require('../services/uploads');
const router = express.Router();

const upload = createUpload('scan');

function generateRef(db) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const count = db.prepare("SELECT COUNT(*) as c FROM fiches_reception WHERE created_at >= date('now')").get().c;
  return 'FR-' + y + m + '-' + String(count + 1).padStart(3, '0');
}

// GET /api/fiches — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { statut, localite_id, debut, fin } = req.query;

  let query = `
    SELECT fr.*, l.nom as localite_nom, u.username as cree_par,
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

  query += ' ORDER BY fr.id DESC LIMIT 200';
  const fiches = db.prepare(query).all(...params);
  res.json({ fiches });
});

// GET /api/fiches/:id — detail
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays, u.username as cree_par
    FROM fiches_reception fr
    LEFT JOIN localites l ON fr.localite_id = l.id
    LEFT JOIN users u ON fr.user_id = u.id
    WHERE fr.id = ?
  `).get(req.params.id);

  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  const lignes = db.prepare(`
    SELECT fra.*, a.nom as article_nom, a.reference, a.unite, a.type_article
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
      VALUES (?, ?, ?, 'envoyee', ?, datetime('now'))
    `).run(reference, localite_id, req.user.id, notes || null);

    ficheId = result.lastInsertRowid;

    const insertLigne = db.prepare(`
      INSERT INTO fiche_reception_articles (fiche_id, article_id, quantite, numero_debut, numero_fin, observation)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMvt = db.prepare(`
      INSERT INTO mouvements (article_id, type, quantite, motif, user_id, localite_id, fiche_id, date)
      VALUES (?, 'sortie', ?, 'Envoi — Fiche ' || ?, ?, ?, ?, datetime('now'))
    `);
    const updateStock = db.prepare(`
      UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime('now') WHERE id = ?
    `);

    for (const art of articles) {
      const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.article_id);
      if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');
      if (article.stock_actuel < art.quantite) {
        throw new Error('Stock insuffisant pour ' + article.nom + ' (disponible: ' + article.stock_actuel + ' ' + article.unite + ')');
      }

      if (article.type_article === 'numerote') {
        if (parseNumero(art.numero_debut) === null || parseNumero(art.numero_fin) === null) {
          throw new Error('La plage de numeros (debut-fin) est requise pour un article numerote : ' + article.nom + '.');
        }
        const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'sortie');
        if (overlap) throw new Error('Chevauchement : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja envoyee (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
        recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'sortie', ficheId);
      }

      insertLigne.run(ficheId, art.article_id, art.quantite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
      insertMvt.run(art.article_id, art.quantite, reference, req.user.id, localite_id, ficheId);
      updateStock.run(art.quantite, art.article_id);
    }
  });

  try {
    transaction();

    // Recuperer la fiche creee avec les infos pour le PDF
    const fiche = db.prepare(`
      SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays
      FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
    `).get(ficheId);

    const lignes = db.prepare(`
      SELECT fra.*, a.nom as article_nom, a.unite
      FROM fiche_reception_articles fra LEFT JOIN articles a ON fra.article_id = a.id WHERE fra.fiche_id = ?
    `).all(ficheId);

    // Generer le PDF
    try {
      const pdfPath = await generateFichePDF(fiche, lignes);
      db.prepare('UPDATE fiches_reception SET fichier_path = ?, updated_at = datetime(\'now\') WHERE id = ?').run(pdfPath, ficheId);
      fiche.fichier_path = pdfPath;
    } catch (pdfErr) {
      console.error('Erreur generation PDF:', pdfErr.message);
      // On continue meme si le PDF echoue
    }

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
    SELECT fra.*, a.nom as article_nom, a.unite
    FROM fiche_reception_articles fra LEFT JOIN articles a ON fra.article_id = a.id WHERE fra.fiche_id = ?
  `).all(req.params.id);

  const ficheInfo = db.prepare(`
    SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays
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

// PATCH /api/fiches/:id/statut — changer statut
router.patch('/:id/statut', authenticate, (req, res) => {
  const db = req.db;
  const { statut } = req.body;
  if (!['envoyee', 'signee', 'archivee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide (envoyee, signee ou archivee).' });
  }

  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  db.prepare('UPDATE fiches_reception SET statut = ?, updated_at = datetime(\'now\') WHERE id = ?').run(statut, req.params.id);

  const updated = db.prepare(`
    SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);
  res.json({ fiche: updated, message: 'Statut mis a jour : ' + statut });
});

// POST /api/fiches/:id/upload — uploader le scan signe
router.post('/:id/upload', authenticate, upload, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Fichier scan requis.' });

  const scanPath = '/uploads/' + req.file.filename;
  db.prepare('UPDATE fiches_reception SET fichier_path = ?, statut = \'archivee\', updated_at = datetime(\'now\') WHERE id = ?')
    .run(scanPath, req.params.id);

  const updated = db.prepare(`
    SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?
  `).get(req.params.id);

  res.json({ fiche: updated, message: 'Scan uploade et fiche archivee.' });
});

// DELETE /api/fiches/:id (admin seulement)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  const transaction = db.transaction(() => {
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
  res.json({ message: 'Fiche supprimee.' });
});

module.exports = router;
