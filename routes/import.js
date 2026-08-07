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
              ).run(ref, libelle, 'piece', numeros ? 'numerote' : 'standard');
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
              INSERT INTO mouvements (article_id, type, quantite, motif, user_id, localite_id, date)
              VALUES (?, 'sortie', ?, 'Import historique', ?, ?, ?)
            `).run(article.id, quantite, req.user.id, loc ? loc.id : null, dateFormatted);

            imported.mouvements++;
          } catch (err) {
            imported.erreurs.push('Ligne ' + i + ': ' + err.message);
          }
        }
      });

      transaction();

      // === Mise a jour des stocks depuis Feuil4 (quantites 2026 = stock disponible) ===
      if (workbook.SheetNames.includes('Feuil4')) {
        const sheet4 = workbook.Sheets['Feuil4'];
        const data4 = XLSX.utils.sheet_to_json(sheet4, { header: 1 });
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

        const agg = {};
        for (let i = 2; i < data4.length; i++) {
          const r = data4[i];
          if (!r || !r[0]) continue;
          const label = String(r[0]).trim();
          if (/^total/i.test(label)) continue; // ignorer « Total general »
          const qty = Number(r[1] !== '' && r[1] !== undefined ? r[1] : r[r.length - 1]);
          const k = norm(label);
          agg[k] = { label, qty: (agg[k] ? agg[k].qty : 0) + (isNaN(qty) ? 0 : qty) };
        }

        const allArts = db.prepare('SELECT id, nom FROM articles').all();
        const byNorm = {};
        for (const a of allArts) byNorm[norm(a.nom)] = a.id;

        const updateStock = db.prepare("UPDATE articles SET stock_actuel = ?, updated_at = datetime('now','localtime') WHERE id = ?");
        let stocked = 0;
        for (const k of Object.keys(agg)) {
          if (byNorm[k]) { updateStock.run(agg[k].qty, byNorm[k]); stocked++; }
        }
        imported.stock = stocked;
      }
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

  res.json({ imported, message: 'Import termine : ' + imported.articles + ' articles, ' + imported.mouvements + ' mouvements, ' + (imported.stock || 0) + ' stocks mis a jour.' });
});

module.exports = router;
