// routes/fiches_besoin.js — Fiches de besoin (demande d'achat -> service achat -> retour scanne)
const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { createUpload } = require('../services/uploads');
const { logAudit } = require('../services/audit');
const router = express.Router();

const upload = createUpload('scan');

function generateRef(db) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'fiches_besoin'").get();
  const next = (seq ? seq.seq : 0) + 1;
  return 'FB-' + y + m + '-' + String(next).padStart(3, '0');
}

// GET /api/fiches-besoin — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { statut, debut, fin } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (statut) { where += ' AND fb.statut = ?'; params.push(statut); }
  if (debut) { where += ' AND fb.date_creation >= ?'; params.push(debut); }
  if (fin) { where += ' AND fb.date_creation <= ?'; params.push(fin + ' 23:59:59'); }

  const fiches = db.prepare(`
    SELECT fb.*, u.username as cree_par,
      (SELECT COUNT(*) FROM fiche_besoin_articles WHERE fiche_id = fb.id) as nb_lignes
    FROM fiches_besoin fb
    LEFT JOIN users u ON fb.user_id = u.id
    ${where}
    ORDER BY fb.id DESC LIMIT 200
  `).all(...params);
  res.json({ fiches });
});

// GET /api/fiches-besoin/:id — detail
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fb.*, u.username as cree_par FROM fiches_besoin fb LEFT JOIN users u ON fb.user_id = u.id WHERE fb.id = ?
  `).get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });

  const lignes = db.prepare(`
    SELECT fba.*, a.nom as article_nom, a.reference, a.unite
    FROM fiche_besoin_articles fba LEFT JOIN articles a ON fba.article_id = a.id
    WHERE fba.fiche_id = ?
  `).all(req.params.id);
  res.json({ fiche, lignes });
});

// POST /api/fiches-besoin — creer
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { notes, articles } = req.body;
  if (!articles || !articles.length) return res.status(400).json({ error: 'Au moins un article requis.' });

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
        INSERT INTO fiches_besoin (reference, notes, user_id, statut)
        VALUES (?, ?, ?, 'creee')
      `).run(reference, notes || null, req.user.id);
      ficheId = result.lastInsertRowid;

      const insertLigne = db.prepare(`
        INSERT INTO fiche_besoin_articles (fiche_id, article_id, quantite, observation)
        VALUES (?, ?, ?, ?)
      `);
      for (const art of articles) {
        const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(art.article_id);
        if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');
        insertLigne.run(ficheId, art.article_id, art.quantite, art.observation || null);
      }
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(ficheId);
  logAudit(db, req.user.id, req.user.username, 'CREER_FICHE_BESOIN', reference);
  res.status(201).json({ fiche });
});

// PATCH /api/fiches-besoin/:id/statut — transmise | archivee
router.patch('/:id/statut', authenticate, (req, res) => {
  const db = req.db;
  const { statut } = req.body;
  if (!['transmise', 'archivee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide (transmise ou archivee).' });
  }

  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });

  if (statut === 'transmise' && fiche.statut !== 'creee') {
    return res.status(400).json({ error: 'Seule une fiche « creee » peut etre marquee transmise.' });
  }
  if (statut === 'archivee' && fiche.statut !== 'revenue') {
    return res.status(400).json({ error: 'Marquez d\'abord le retour (scan) avant d\'archiver.' });
  }

  db.prepare('UPDATE fiches_besoin SET statut = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(statut, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'STATUT_FICHE_BESOIN', (fiche.reference || req.params.id) + ' -> ' + statut);

  const updated = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  res.json({ fiche: updated });
});

// POST /api/fiches-besoin/:id/scan — upload du retour signe -> statut revenue
router.post('/:id/scan', authenticate, upload, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Scan requis.' });
  if (fiche.statut !== 'transmise') return res.status(400).json({ error: 'La fiche doit etre « transmise » avant d\'enregistrer un retour.' });

  const scanPath = '/uploads/' + req.file.filename;
  db.prepare('UPDATE fiches_besoin SET scan_path = ?, statut = \'revenue\', updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(scanPath, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'SCAN_FICHE_BESOIN', fiche.reference || String(req.params.id));

  const updated = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  res.json({ fiche: updated });
});

// DELETE /api/fiches-besoin/:id (admin)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });

  db.prepare('DELETE FROM fiches_besoin WHERE id = ?').run(req.params.id);
  logAudit(db, req.user.id, req.user.username, 'SUPPR_FICHE_BESOIN', fiche.reference || String(req.params.id));

  if (fiche.scan_path) {
    const uploadsDir = require('../services/paths').uploadDir;
    const full = path.resolve(uploadsDir, String(fiche.scan_path).replace(/^\/uploads\//, ''));
    if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch (e) { /* deja supprime */ } }
  }

  res.json({ message: 'Fiche de besoin supprimee.' });
});

module.exports = router;
