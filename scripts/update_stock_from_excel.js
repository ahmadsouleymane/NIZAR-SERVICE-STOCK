// scripts/update_stock_from_excel.js — Met a jour le stock des articles depuis Feuil4 du fichier Excel
// Usage : node scripts/update_stock_from_excel.js
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const EXCEL = '/Users/macbookair/Desktop/Carnets et fournitures de gestion.xlsx';
const db = new Database(path.join(__dirname, '..', 'database', 'nizar.db'));
db.pragma('foreign_keys = ON');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const wb = XLSX.readFile(EXCEL);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Feuil4'], { header: 1, defval: '' });

// 1. Aggreger les quantites de Feuil4 par etiquette normalisee (somme des doublons)
const agg = {};
for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r || !r[0]) continue;
  const label = String(r[0]).trim();
  if (!label || /^total/i.test(label)) continue; // ignorer la ligne « Total général »
  const qty = Number(r[1] !== '' && r[1] !== undefined ? r[1] : r[r.length - 1]);
  const k = norm(label);
  agg[k] = { label, qty: (agg[k] ? agg[k].qty : 0) + (isNaN(qty) ? 0 : qty) };
}

// 2. Articles de la base
const articles = db.prepare('SELECT id, nom, reference, stock_actuel FROM articles').all();
const artByNorm = {};
for (const a of articles) artByNorm[norm(a.nom)] = a;

const localites = new Set(db.prepare('SELECT nom FROM localites').all().map(l => norm(l.nom)));

// 3. Mise a jour
const update = db.prepare("UPDATE articles SET stock_actuel = ?, updated_at = datetime('now','localtime') WHERE id = ?");
const tx = db.transaction(() => {
  for (const k of Object.keys(agg)) {
    const a = agg[k];
    if (artByNorm[k]) update.run(a.qty, artByNorm[k].id);
  }
});
tx();

// 4. Rapport
const updateStmt = db.prepare('SELECT nom, reference, stock_actuel FROM articles ORDER BY nom');
console.log('=== NOUVEAU STOCK PAR ARTICLE ===');
for (const a of updateStmt.all()) {
  const src = agg[norm(a.nom)];
  console.log('  ' + a.reference.padEnd(16) + ' ' + a.nom.padEnd(28) + ' → ' + a.stock_actuel + (src ? '' : '  (aucune valeur Feuil4)'));
}
console.log('\n=== Lignes Feuil4 NON correspondantes (ignorées) ===');
for (const k of Object.keys(agg)) {
  if (!artByNorm[k]) {
    console.log('  ' + agg[k].label.padEnd(28) + ' → ' + agg[k].qty + (localites.has(k) ? '  (agence)' : '  (inconnue)'));
  }
}
db.close();
