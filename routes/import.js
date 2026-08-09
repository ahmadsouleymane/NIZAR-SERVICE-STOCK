// routes/import.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: function(req, file, cb) {
    cb(null, 'import-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      cb(new Error('Format de fichier non autorise. Utilisez un fichier Excel (.xlsx ou .xls).'));
      return;
    }
    cb(null, true);
  }
});

// POST /api/import/excel - importer les donnees historiques (admin seulement)
router.post('/excel', authenticate, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis.' });

  const db = req.db;
  let imported = { articles: 0, mouvements: 0, erreurs: [] };

  try {
    const workbook = XLSX.readFile(req.file.path);

    // Importer depuis Feuil1 (journal des sorties)
    if (workbook.SheetNames.includes('Feuil1')) {
      const sheet = workbook.Sheets['Feuil1'];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const transaction = db.transaction(() => {
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || !row[0] || !row[1]) continue;

          try {
            const dateStr = row[0];
            const libelle = String(row[1]).trim();
            const localite = String(row[2] || '').trim();
            const quantite = parseFloat(row[3]) || 1;
            const numeros = row[4] ? String(row[4]).trim() : '';

            // Creer ou recuperer l'article
            let article = db.prepare('SELECT * FROM articles WHERE nom = ?').get(libelle);
            if (!article) {
              const baseRef = libelle.substring(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '-');
              const existingCount = db.prepare("SELECT COUNT(*) as c FROM articles WHERE reference LIKE ?").get(baseRef + '%').c;
              const ref = baseRef + (existingCount > 0 ? '-' + (existingCount + 1) : '');
              const result = db.prepare(
                'INSERT INTO articles (reference, nom, unite, stock_min, type_article, stock_actuel) VALUES (?, ?, ?, 5, ?, 0)'
              ).run(ref, libelle, 'unite', numeros ? 'numerote' : 'standard');
              article = { id: result.lastInsertRowid };
              imported.articles++;
            }

            // Creer ou recuperer la localite
            let loc = null;
            if (localite) {
              loc = db.prepare('SELECT * FROM localites WHERE nom = ?').get(localite);
              if (!loc) {
                const result = db.prepare('INSERT INTO localites (nom, type) VALUES (?, ?)').run(localite, 'national');
                loc = { id: result.lastInsertRowid };
              }
            }

            // Creer le mouvement (historique — ne modifie pas le stock)
            const dateFormatted = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            db.prepare(`
              INSERT INTO mouvements (article_id, type, quantite, user_id, localite_id, date)
              VALUES (?, 'sortie', ?, ?, ?, ?)
            `).run(article.id, quantite, req.user.id, loc ? loc.id : null, dateFormatted);

            imported.mouvements++;
          } catch (err) {
            imported.erreurs.push('Ligne ' + i + ': ' + err.message);
          }
        }
      });

      transaction();
    } else {
      imported.erreurs.push('Feuille "Feuil1" introuvable dans le fichier.');
    }
  } catch (err) {
    // Nettoyer le fichier en cas d'erreur
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    return res.status(400).json({ error: 'Erreur de lecture du fichier Excel : ' + err.message });
  }

  // Nettoyer le fichier uploade
  try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }

  res.json({ imported, message: 'Import termine : ' + imported.articles + ' articles, ' + imported.mouvements + ' mouvements (sorties).' });
});

// POST /api/import/entrees — importer des entrees fournisseur depuis Excel
// Format : Article | Quantite | N° debut | N° fin | Observation
router.post('/entrees', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis.' });
  const db = req.db;
  const { fournisseur_id, numero_bl, numero_facture, numero_fiche_besoin } = req.body;
  let imported = { articles: 0, erreurs: [] };

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) { try { fs.unlinkSync(req.file.path); } catch (e) {} return res.status(400).json({ error: 'Fichier Excel vide.' }); }
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    const now = new Date();
    const y = now.getFullYear().toString().slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'fiches_entree'").get();
    const reference = 'FE-' + y + m + '-' + String((seq ? seq.seq : 0) + 1).padStart(3, '0');
    let ficheId = null;

    const { checkOverlap, recordSerie } = require('../services/series');

    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO fiches_entree (reference, fournisseur_id, date_entree, numero_bl, numero_facture, numero_fiche_besoin, user_id, statut, validee, articles_json)
        VALUES (?, ?, datetime('now','localtime'), ?, ?, ?, ?, 'validee', 1, '[]')
      `).run(reference, fournisseur_id || null, numero_bl || null, numero_facture || null, numero_fiche_besoin || null, req.user.id);
      ficheId = result.lastInsertRowid;

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue;
        try {
          const articleNom = String(row[0]).trim();
          const quantite = parseInt(row[1], 10) || 1;
          const nd = row[2] ? String(row[2]).trim() : null;
          const nf = row[3] ? String(row[3]).trim() : null;
          const obs = row[4] ? String(row[4]).trim() : null;

          let article = db.prepare('SELECT * FROM articles WHERE nom = ? OR reference = ?').get(articleNom, articleNom);
          if (!article) { imported.erreurs.push('Ligne ' + (i + 1) + ' : article "' + articleNom + '" introuvable.'); continue; }

          if (article.type_article === 'numerote') {
            if (!nd || !nf) { imported.erreurs.push('Ligne ' + (i + 1) + ' : N° debut/fin requis pour article numerote.'); continue; }
            if (checkOverlap(db, article.id, nd, nf, 'entree')) { imported.erreurs.push('Ligne ' + (i + 1) + ' : chevauchement plage.'); continue; }
            recordSerie(db, article.id, nd, nf, quantite, 'entree', ficheId);
          }

          db.prepare('INSERT INTO fiche_entree_articles (fiche_id, article_id, quantite, numero_debut, numero_fin, observation) VALUES (?,?,?,?,?,?)').run(ficheId, article.id, quantite, nd, nf, obs || null);
          db.prepare("INSERT INTO mouvements (article_id, type, quantite, motif, user_id, fournisseur_id, entree_id, numero_debut, numero_fin, date) VALUES (?,'entree',?,'Entree fournisseur — ' || ?,?,?,?,?,?, datetime('now','localtime'))").run(article.id, quantite, reference, req.user.id, fournisseur_id || null, ficheId, nd, nf);
          db.prepare("UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime('now','localtime') WHERE id = ?").run(quantite, article.id);
          imported.articles++;
        } catch (err) { imported.erreurs.push('Ligne ' + (i + 1) + ' : ' + err.message); }
      }
    });
    transaction();
  } catch (err) {
    if (req.file && req.file.path) try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: 'Erreur de lecture : ' + err.message });
  }
  try { fs.unlinkSync(req.file.path); } catch (e) {}
  res.json({ imported, reference, message: 'Import termine : ' + imported.articles + ' entrees, ' + imported.erreurs.length + ' erreurs.' });
});

module.exports = router;
