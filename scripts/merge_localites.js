// scripts/merge_localites.js — Fusionne les localites dupliquees (casse, typo, services)
// Usage : node scripts/merge_localites.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'database', 'nizar.db'));
db.pragma('foreign_keys = ON');

// Groups : { canonical: [duplicates...] } — conserve le nom bien ecrit / le service
const MERGE = {
  7:  [24],      // Abalak
  2:  [23],      // Agadez
  8:  [17],      // Arlit
  3:  [20],      // Dosso
  13: [21],      // Doutchi
  11: [28],      // Gaya
  10: [32],      // Madaoua
  4:  [18],      // Maradi
  1:  [19],      // Niamey
  5:  [26],      // Tahoua
  12: [29],      // Tessaoua
  6:  [22],      // Zinder
  64: [33, 37],  // Comptabilite (service) <- COMPTABILITE, Comptabilité
  15: [35],      // Service Achat (service) <- SERVICE ACHAT
  31: [30],      // Contrôle (le plus reference) <- Contrôle
  67: [25],      // Ressources Humaines (service) <- RH
  16: [52]       // Accra (international) <- Acrra (typo)
};

const tables = ['fiches_reception', 'mouvements', 'retours_carnets'];

const del = db.prepare('DELETE FROM localites WHERE id = ?');

const tx = db.transaction(() => {
  for (const canonical of Object.keys(MERGE)) {
    for (const dup of MERGE[canonical]) {
      for (const t of tables) {
        db.prepare(`UPDATE ${t} SET localite_id = ? WHERE localite_id = ?`).run(parseInt(canonical, 10), dup);
      }
      const r = del.run(dup);
      console.log(`  fusion ${dup} -> ${canonical} (lignes supprimees: ${r.changes})`);
    }
  }
});

tx();

// Verification d'integrite
const dupCheck = db.prepare('SELECT COUNT(*) c FROM (SELECT lower(nom) n FROM localites GROUP BY lower(nom) HAVING COUNT(*) > 1)').get();
const orphan = db.prepare(`
  SELECT COUNT(*) c FROM mouvements m LEFT JOIN localites l ON m.localite_id = l.id WHERE m.localite_id IS NOT NULL AND l.id IS NULL
`).get();
console.log('--- verification ---');
console.log('groupes encore dupliques:', dupCheck.c);
console.log('mouvements orphelins:', orphan.c);
console.log('total localites:', db.prepare('SELECT COUNT(*) c FROM localites').get().c);
db.close();
