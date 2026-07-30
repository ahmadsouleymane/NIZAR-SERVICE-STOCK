// routes/fiches_reception.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Configuration multer pour l'upload des scans
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'fiche-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Helper: generer reference fiche
function generateRef(db) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const count = db.prepare("SELECT COUNT(*) as c FROM fiches_reception WHERE created_at >= date('now')").get().c;
  return 'FR-' + y + m + '-' + String(count + 1).padStart(3, '0');
}

// GET /api/fiches - liste
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

// GET /api/fiches/:id - detail avec lignes
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays,
           u.username as cree_par
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

// POST /api/fiches - creer une fiche (depuis une sortie)
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { localite_id, articles, notes } = req.body;

  if (!localite_id) return res.status(400).json({ error: 'Localite (destination) requise.' });
  if (!articles || !articles.length) return res.status(400).json({ error: 'Au moins un article requis.' });

  const reference = generateRef(db);

  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO fiches_reception (reference, localite_id, user_id, statut, notes, date_envoi)
      VALUES (?, ?, ?, 'envoyee', ?, datetime('now'))
    `).run(reference, localite_id, req.user.id, notes || null);

    const ficheId = result.lastInsertRowid;

    const insertLigne = db.prepare(`
      INSERT INTO fiche_reception_articles (fiche_id, article_id, quantite, numero_debut, numero_fin, observation)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMvt = db.prepare(`
      INSERT INTO mouvements (article_id, type, quantite, motif, user_id, localite_id, fiche_id, date)
      VALUES (?, 'sortie', ?, 'Envoi vers localite', ?, ?, ?, datetime('now'))
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

      insertLigne.run(ficheId, art.article_id, art.quantite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
      insertMvt.run(art.article_id, art.quantite, req.user.id, localite_id, ficheId);
      updateStock.run(art.quantite, art.article_id);
    }

    return ficheId;
  });

  try {
    const ficheId = transaction();
    const fiche = db.prepare('SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?').get(ficheId);
    res.status(201).json({ fiche });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/fiches/:id/statut - changer statut (signee, archivee)
router.patch('/:id/statut', authenticate, (req, res) => {
  const db = req.db;
  const { statut } = req.body;
  if (!['envoyee', 'signee', 'archivee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }

  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  db.prepare('UPDATE fiches_reception SET statut = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(statut, req.params.id);

  const updated = db.prepare('SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?').get(req.params.id);
  res.json({ fiche: updated });
});

// POST /api/fiches/:id/upload - uploader le scan de la fiche signee
router.post('/:id/upload', authenticate, upload.single('scan'), (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });

  if (!req.file) return res.status(400).json({ error: 'Fichier scan requis.' });

  const filePath = '/uploads/' + req.file.filename;
  db.prepare('UPDATE fiches_reception SET fichier_path = ?, statut = \'signee\', updated_at = datetime(\'now\') WHERE id = ?')
    .run(filePath, req.params.id);

  const updated = db.prepare('SELECT fr.*, l.nom as localite_nom FROM fiches_reception fr LEFT JOIN localites l ON fr.localite_id = l.id WHERE fr.id = ?').get(req.params.id);
  res.json({ fiche: updated, message: 'Scan uploadé avec succès.' });
});

// DELETE /api/fiches/:id
router.delete('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_reception WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche introuvable.' });
  if (fiche.statut !== 'brouillon') {
    return res.status(400).json({ error: 'Seules les fiches en brouillon peuvent etre supprimees.' });
  }
  db.prepare('DELETE FROM fiches_reception WHERE id = ?').run(req.params.id);
  res.json({ message: 'Fiche supprimee.' });
});

module.exports = router;
