// scripts/create_fiches_from_import.js
// Cree des fiches de reception a partir des mouvements importes (historique Excel).
// Regroupe par date + localite, cree une fiche par groupe, lie les mouvements.
// Usage : node scripts/create_fiches_from_import.js

const initDB = require('../database/init');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'nizar.db');
const db = initDB(dbPath);

// Groupes : date + localite_id
const groups = db.prepare(`
  SELECT date(m.date) as jour, m.localite_id, COUNT(*) as lignes
  FROM mouvements m
  WHERE m.localite_id IS NOT NULL
  GROUP BY date(m.date), m.localite_id
  ORDER BY jour
`).all();

console.log('Groupes a traiter :', groups.length);

// Generer une reference FR-YYMM-### basee sur la date du mouvement
// et un compteur par mois
const counters = {};
function makeRef(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const key = y + m;
  if (!counters[key]) counters[key] = 0;
  counters[key]++;
  return 'FR-' + key + '-' + String(counters[key]).padStart(3, '0');
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

let fichesCreated = 0;
let lignesCreated = 0;

const transaction = db.transaction(() => {
  for (const g of groups) {
    const dateStr = g.jour + ' 00:00:00';
    const ref = makeRef(g.jour);

    const result = insertFiche.run(ref, g.localite_id, dateStr, dateStr, ref);
    const ficheId = result.lastInsertRowid;
    fichesCreated++;

    // Mouvements de ce groupe
    const mvts = db.prepare(`
      SELECT m.id, m.article_id, m.quantite, m.numero_debut, m.numero_fin, a.unite
      FROM mouvements m
      LEFT JOIN articles a ON m.article_id = a.id
      WHERE date(m.date) = ? AND m.localite_id = ?
    `).all(g.jour, g.localite_id);

    for (const m of mvts) {
      insertLigne.run(ficheId, m.article_id, m.quantite, m.unite || '', m.numero_debut || null, m.numero_fin || null);
      updateMvt.run(ficheId, m.id);
      lignesCreated++;
    }
  }

  // Mouvements sans localite (destination inconnue) : une fiche par jour
  const orphanGroups = db.prepare(`
    SELECT date(m.date) as jour, COUNT(*) as lignes
    FROM mouvements m
    WHERE m.localite_id IS NULL
    GROUP BY date(m.date)
    ORDER BY jour
  `).all();

  for (const og of orphanGroups) {
    const dateStr = og.jour + ' 00:00:00';
    const ref = makeRef(og.jour);

    const result = insertFiche.run(ref, null, dateStr, dateStr, ref);
    const ficheId = result.lastInsertRowid;
    fichesCreated++;

    const mvts = db.prepare(`
      SELECT m.id, m.article_id, m.quantite, m.numero_debut, m.numero_fin, a.unite
      FROM mouvements m
      LEFT JOIN articles a ON m.article_id = a.id
      WHERE date(m.date) = ? AND m.localite_id IS NULL
    `).all(og.jour);

    for (const m of mvts) {
      insertLigne.run(ficheId, m.article_id, m.quantite, m.unite || '', m.numero_debut || null, m.numero_fin || null);
      updateMvt.run(ficheId, m.id);
      lignesCreated++;
    }
  }
});

try {
  transaction();
  console.log('Fiches creees  :', fichesCreated);
  console.log('Lignes creees  :', lignesCreated);

  const total = db.prepare('SELECT COUNT(*) c FROM fiches_reception').get();
  const mvtsLinked = db.prepare('SELECT COUNT(*) c FROM mouvements WHERE fiche_id IS NOT NULL').get();
  console.log('Total fiches   :', total.c);
  console.log('Mvts lies      :', mvtsLinked.c, '/', db.prepare('SELECT COUNT(*) c FROM mouvements').get().c);
} catch (err) {
  console.error('Erreur:', err.message);
  process.exit(1);
}

db.close();
console.log('Termine.');
