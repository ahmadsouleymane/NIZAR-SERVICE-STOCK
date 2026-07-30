// routes/import.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: function(req, file, cb) {
    cb(null, 'import-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// POST /api/import/excel - importer les donnees historiques
router.post('/excel', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis.' });

  const db = req.db;
  const workbook = XLSX.readFile(req.file.path);
  let imported = { articles: 0, mouvements: 0, erreurs: [] };

  // Importer depuis Feuil1 (journal des sorties)
  if (workbook.SheetNames.includes('Feuil1')) {
    const sheet = workbook.Sheets['Feuil1'];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const transaction = db.transaction(() => {
      // Skip header row
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0] || !row[1]) continue;

        try {
          const dateStr = row[0];
          const libelle = String(row[1]).trim();
          const localite = String(row[2] || '').trim();
          const quantite = parseFloat(row[3]) || 1;
          const numeros = row[4] ? String(row[4]).trim() : '';

          // Créer ou récupérer l'article
          let article = db.prepare('SELECT * FROM articles WHERE nom = ?').get(libelle);
          if (!article) {
            const ref = 'IMP-' + libelle.substring(0, 3).toUpperCase() + '-' + Date.now().toString(36);
            const result = db.prepare(
              'INSERT INTO articles (reference, nom, unite, stock_min, type_article) VALUES (?, ?, ?, 5, ?)'
            ).run(ref, libelle, 'piece', numeros ? 'numerote' : 'standard');
            article = { id: result.lastInsertRowid };
            imported.articles++;
          }

          // Créer ou récupérer la localité
          let loc = null;
          if (localite) {
            loc = db.prepare('SELECT * FROM localites WHERE nom = ?').get(localite);
            if (!loc) {
              const result = db.prepare('INSERT INTO localites (nom, type) VALUES (?, ?)').run(localite, 'national');
              loc = { id: result.lastInsertRowid };
            }
          }

          // Créer le mouvement
          const dateFormatted = dateStr ? new Date(dateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          db.prepare(`
            INSERT INTO mouvements (article_id, type, quantite, motif, user_id, localite_id, date)
            VALUES (?, 'sortie', ?, 'Import historique', 1, ?, ?)
          `).run(article.id, quantite, loc ? loc.id : null, dateFormatted);

          // Mettre à jour le stock (on ajoute d'abord puis on soustrait pour simuler l'historique)
          db.prepare('UPDATE articles SET stock_actuel = stock_actuel + ? WHERE id = ?').run(quantite, article.id);

          imported.mouvements++;
        } catch (err) {
          imported.erreurs.push('Ligne ' + i + ': ' + err.message);
        }
      }
    });

    transaction();
  }

  // Nettoyer le fichier uploadé
  fs.unlinkSync(req.file.path);

  res.json({ imported, message: 'Import termine : ' + imported.articles + ' articles, ' + imported.mouvements + ' mouvements.' });
});

module.exports = router;
