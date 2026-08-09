// scripts/reconcile_historique_entrees.js
// Cree, pour chaque mouvement de sortie historique importe (Excel), un mouvement
// d'entree jumeau (meme article, meme quantite, meme date) — et la serie de numeros
// jumelle pour les articles numerotes — afin que le solde (entrees - sorties) et le
// total "emis" (billets en circulation) ne soient jamais negatifs : chaque sortie
// historique a desormais une entree correspondante, motif marque « reconstitution »
// pour rester distinguable des vraies entrees fournisseur.
// Usage : node scripts/reconcile_historique_entrees.js
// Idempotent : ignore les sorties qui ont deja leur entree jumelle (motif dedie).

const initDB = require('../database/init');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'nizar.db');
const db = initDB(dbPath);

const MOTIF = 'Entrée historique (reconstitution)';

const sorties = db.prepare(`
  SELECT id, article_id, quantite, numero_debut, numero_fin, date, user_id
  FROM mouvements
  WHERE type = 'sortie'
  ORDER BY id ASC
`).all();

console.log('Sorties a traiter :', sorties.length);

// Idempotence : si une entree-jumelle existe deja pour cette sortie (meme motif),
// on ne la recree pas (permet de relancer le script sans dupliquer).
const dejaJumelee = new Set(
  db.prepare(`SELECT DISTINCT article_id || '|' || quantite || '|' || date AS k FROM mouvements WHERE type = 'entree' AND motif = ?`).all(MOTIF)
    .map(r => r.k)
);

const insertMvt = db.prepare(`
  INSERT INTO mouvements (article_id, type, quantite, motif, user_id, numero_debut, numero_fin, date)
  VALUES (?, 'entree', ?, ?, ?, ?, ?, ?)
`);
const insertSerie = db.prepare(`
  INSERT INTO series_numeros (article_id, numero_debut, numero_fin, quantite, source_type, source_id, date)
  VALUES (?, ?, ?, ?, 'entree', NULL, ?)
`);

let mvtCrees = 0, seriesCreees = 0, ignorees = 0;

const transaction = db.transaction(() => {
  for (const s of sorties) {
    const key = s.article_id + '|' + s.quantite + '|' + s.date;
    if (dejaJumelee.has(key)) { ignorees++; continue; }

    insertMvt.run(s.article_id, s.quantite, MOTIF, s.user_id, s.numero_debut, s.numero_fin, s.date);
    mvtCrees++;

    if (s.numero_debut && s.numero_fin) {
      insertSerie.run(s.article_id, s.numero_debut, s.numero_fin, s.quantite, s.date);
      seriesCreees++;
    }
  }
});

transaction();

console.log('Mouvements entree crees :', mvtCrees);
console.log('Series entree creees    :', seriesCreees);
console.log('Deja jumelees (ignorees):', ignorees);

const totals = db.prepare(`
  SELECT
    (SELECT COALESCE(SUM(quantite),0) FROM mouvements WHERE type='entree') as total_entrees,
    (SELECT COALESCE(SUM(quantite),0) FROM mouvements WHERE type='sortie') as total_sorties
`).get();
console.log('Total entrees en base   :', totals.total_entrees);
console.log('Total sorties en base   :', totals.total_sorties);
console.log('Solde (doit etre 0)     :', totals.total_entrees - totals.total_sorties);

db.close();
console.log('Termine.');
