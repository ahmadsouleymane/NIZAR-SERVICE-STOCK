// scripts/create_fiches_from_import.js
// Cree des fiches de reception (+ PDF imprimable) a partir des mouvements importes
// (historique Excel). Regroupe par date + localite, cree une fiche par groupe,
// lie les mouvements, genere le PDF de chaque fiche.
// Usage : node scripts/create_fiches_from_import.js

const initDB = require('../database/init');
const path = require('path');
const { generateFichePDF } = require('../services/pdf');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'nizar.db');
const db = initDB(dbPath);

// Groupes : date + localite_id
const groups = db.prepare(`
  SELECT date(m.date) as jour, m.localite_id, COUNT(*) as lignes
  FROM mouvements m
  WHERE m.localite_id IS NOT NULL AND m.fiche_id IS NULL AND m.type = 'sortie'
  GROUP BY date(m.date), m.localite_id
  ORDER BY jour
`).all();

console.log('Groupes a traiter :', groups.length);

// Reference chronologique BR-NUM-ANNEEMOIS (meme format que les fiches creees en direct).
// Repart apres le plus grand numero deja utilise ce mois-la (la base peut deja
// contenir des fiches reelles ou d'un import precedent pour ce mois).
const counters = {};
function makeRef(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const key = y + m;
  if (!counters[key]) {
    const row = db.prepare("SELECT reference FROM fiches_reception WHERE reference LIKE 'BR-%-' || ? ORDER BY reference DESC LIMIT 1").get(key);
    counters[key] = row ? parseInt(row.reference.split('-')[1], 10) : 0;
  }
  counters[key]++;
  return 'BR-' + String(counters[key]).padStart(3, '0') + '-' + key;
}

const insertFiche = db.prepare(`
  INSERT INTO fiches_reception (reference, localite_id, user_id, statut, notes, date_envoi, date_creation, numero_facture)
  VALUES (?, ?, 1, 'archivee', 'Import historique', ?, ?, ?)
`);

const insertLigne = db.prepare(`
  INSERT INTO fiche_reception_articles (fiche_id, article_id, quantite, unite, numero_debut, numero_fin)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateMvt = db.prepare('UPDATE mouvements SET fiche_id = ? WHERE id = ?');
const updateFichierPath = db.prepare("UPDATE fiches_reception SET fichier_path = ?, updated_at = datetime('now','localtime') WHERE id = ?");

let fichesCreated = 0;
let lignesCreated = 0;
const fichesForPdf = []; // { id, reference, date_envoi, localite_nom, lignes }

function buildGroup(whereSql, params) {
  for (const g of db.prepare(whereSql).all(...params)) {
    const dateStr = g.jour + ' 00:00:00';
    const ref = makeRef(g.jour);

    const result = insertFiche.run(ref, g.localite_id || null, dateStr, dateStr, ref);
    const ficheId = result.lastInsertRowid;
    fichesCreated++;

    const mvts = db.prepare(`
      SELECT m.id, m.article_id, m.quantite, m.numero_debut, m.numero_fin, a.unite, a.nom as article_nom
      FROM mouvements m
      LEFT JOIN articles a ON m.article_id = a.id
      WHERE date(m.date) = ? AND m.type = 'sortie' AND m.fiche_id IS NULL
        AND ${g.localite_id ? 'm.localite_id = ?' : 'm.localite_id IS NULL'}
    `).all(...(g.localite_id ? [g.jour, g.localite_id] : [g.jour]));

    const lignesPdf = [];
    for (const m of mvts) {
      insertLigne.run(ficheId, m.article_id, m.quantite, m.unite || '', m.numero_debut || null, m.numero_fin || null);
      updateMvt.run(ficheId, m.id);
      lignesCreated++;
      lignesPdf.push({ article_nom: m.article_nom, quantite: m.quantite, numero_debut: m.numero_debut, numero_fin: m.numero_fin, unite: m.unite });
    }

    fichesForPdf.push({ id: ficheId, reference: ref, date_envoi: dateStr, localite_nom: localiteNomFor(g.localite_id), lignes: lignesPdf });
  }
}

const localiteCache = new Map();
function localiteNomFor(id) {
  if (!id) return '';
  if (localiteCache.has(id)) return localiteCache.get(id);
  const row = db.prepare('SELECT nom FROM localites WHERE id = ?').get(id);
  const nom = row ? row.nom : '';
  localiteCache.set(id, nom);
  return nom;
}

const transaction = db.transaction(() => {
  buildGroup(`
    SELECT date(m.date) as jour, m.localite_id, COUNT(*) as lignes
    FROM mouvements m
    WHERE m.localite_id IS NOT NULL AND m.fiche_id IS NULL AND m.type = 'sortie'
    GROUP BY date(m.date), m.localite_id
    ORDER BY jour
  `, []);

  buildGroup(`
    SELECT date(m.date) as jour, NULL as localite_id, COUNT(*) as lignes
    FROM mouvements m
    WHERE m.localite_id IS NULL AND m.fiche_id IS NULL AND m.type = 'sortie'
    GROUP BY date(m.date)
    ORDER BY jour
  `, []);
});

transaction();

console.log('Fiches creees  :', fichesCreated);
console.log('Lignes creees  :', lignesCreated);

// --- Generation des PDF (hors transaction, asynchrone) ---
async function genererPdfs() {
  let ok = 0, fail = 0;
  for (let i = 0; i < fichesForPdf.length; i++) {
    const f = fichesForPdf[i];
    try {
      const pdfPath = await generateFichePDF(f, f.lignes);
      updateFichierPath.run(pdfPath, f.id);
      ok++;
      if (ok % 200 === 0) console.log('  PDF genere :', ok, '/', fichesForPdf.length);
    } catch (err) {
      console.error('  Erreur PDF fiche', f.reference, ':', err.message);
      fail++;
    }
  }
  console.log('PDFs generes   :', ok, 'OK,', fail, 'echecs');

  const total = db.prepare('SELECT COUNT(*) c FROM fiches_reception').get();
  const mvtsLinked = db.prepare("SELECT COUNT(*) c FROM mouvements WHERE fiche_id IS NOT NULL AND type = 'sortie'").get();
  const mvtsTotal = db.prepare("SELECT COUNT(*) c FROM mouvements WHERE type = 'sortie'").get();
  console.log('Total fiches   :', total.c);
  console.log('Sorties liees  :', mvtsLinked.c, '/', mvtsTotal.c);

  db.close();
  console.log('Termine.');
}

genererPdfs().catch((err) => { console.error(err); process.exit(1); });
