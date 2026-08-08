// scripts/regenerate_all_pdfs.js — Regene les PDFs pour toutes les fiches de reception
// Usage : node scripts/regenerate_all_pdfs.js
const initDB = require('../database/init');
const { generateFichePDF } = require('../services/pdf');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'nizar.db');
const db = initDB(dbPath);

async function main() {
  const fiches = db.prepare(`
    SELECT fr.*, l.nom as localite_nom, l.type as localite_type, l.pays as localite_pays, l.est_service as localite_service
    FROM fiches_reception fr
    LEFT JOIN localites l ON fr.localite_id = l.id
    WHERE fr.fichier_path IS NULL
    ORDER BY fr.id ASC
  `).all();

  console.log('Fiches sans PDF :', fiches.length);

  let ok = 0, fail = 0;
  for (let i = 0; i < fiches.length; i++) {
    const f = fiches[i];
    const lignes = db.prepare(`
      SELECT fra.*, a.nom as article_nom, COALESCE(NULLIF(TRIM(fra.unite), ''), a.unite) as unite
      FROM fiche_reception_articles fra
      LEFT JOIN articles a ON fra.article_id = a.id
      WHERE fra.fiche_id = ?
    `).all(f.id);

    try {
      const pdfPath = await generateFichePDF(f, lignes);
      db.prepare("UPDATE fiches_reception SET fichier_path = ?, updated_at = datetime('now','localtime') WHERE id = ?")
        .run(pdfPath, f.id);
      ok++;
      if (ok % 100 === 0) console.log('  Progresse :', ok, '/', fiches.length);
    } catch (err) {
      console.error('  Erreur fiche', f.reference, ':', err.message);
      fail++;
    }
  }

  console.log('Termine :', ok, 'OK,', fail, 'echecs');
  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
