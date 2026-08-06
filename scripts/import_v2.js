// scripts/import_v2.js — Remise à zéro + import du fichier Excel à jour
// Usage : node scripts/import_v2.js "/chemin/vers/fichier.xlsx"
//
// Ce script :
//  1. Vide les données (articles, mouvements, fiches, entrees, series, photos, commandes)
//     en conservant : comptes users, localites, categories, fournisseurs.
//  2. Importe les articles (libellés uniques, normalisés, doublons de casse fusionnés).
//     Les articles porteurs de numéros de souche sont marqués type_article = 'numerote'.
//  3. Importe l'HISTORIQUE DES SORTIES 2026 (Feuil1 + Feuil2 + Feuil3) comme mouvements
//     'sortie', avec numéros de souche (numero_debut / numero_fin) et traçabilité
//     dans series_numeros. Le stock_actuel reste à 0 (l'utilisateur enregistrera
//     ses entrées ensuite). Aucun PDF n'est généré.
//
// Toute l'opération (vider + importer) est dans UNE transaction : si l'import échoue,
// la base reste intacte.

const XLSX = require('xlsx');
const path = require('path');
const initDB = require('../database/init');

const EXCEL = process.argv[2] || '/Users/macbookair/Desktop/Carnets et fournitures de gestion.xlsx';

// ---------- Helpers ----------

function norm(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function excelDate(v) {
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (v == null) return null;
  const d = new Date(String(v));
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

// "6001-6100" -> {debut:6001, fin:6100} ; "501" -> {debut:501, fin:501} ; sinon null
function parseRange(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const parts = t
    .split('-')
    .map((x) => parseInt(x.replace(/\D/g, ''), 10))
    .filter((x) => !isNaN(x));
  if (!parts.length) return null;
  return { debut: parts[0], fin: parts.length > 1 ? parts[parts.length - 1] : parts[0] };
}

function makeRef(name, used) {
  let base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
  if (!base) base = 'ARTICLE';
  let ref = base;
  let i = 1;
  while (used.has(ref)) {
    i++;
    ref = base + '-' + i;
  }
  used.add(ref);
  return ref;
}

function categoryIdFor(name, db) {
  const n = name.toLowerCase();
  let cat = 'Autre';
  if (n.includes('scotch')) cat = 'Emballage';
  else if (
    n.includes('enveloppe') || n.includes('bic') || n.includes('marqueur') ||
    n.includes('agraf') || n.includes('ram ') || n.includes('rouleau') ||
    n.includes('papier') || n.includes('toner') || n.includes('imprimante') ||
    n.includes('scanner') || n.includes('registre') || n.includes('protege')
  ) cat = 'Fournitures de bureau';
  else if (
    n.includes('carnet') || n.includes('billet') || n.includes('voyageur') ||
    n.includes('express') || n.includes('electronique') || n.includes('lettre') ||
    n.includes('bon de') || n.includes('liste') || n.includes('situation')
  ) cat = 'Documents de transport';
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(cat);
  return row ? row.id : null;
}

// ---------- Lecture du classeur ----------

const wb = XLSX.readFile(EXCEL);
const f1 = XLSX.utils.sheet_to_json(wb.Sheets['Feuil1'], { header: 1 });
const f2 = XLSX.utils.sheet_to_json(wb.Sheets['Feuil2'], { header: 1 });
const f3 = XLSX.utils.sheet_to_json(wb.Sheets['Feuil3'], { header: 1 });

// --- Articles (libellés uniques normalisés) ---
const articleNames = new Map(); // normName -> {quantite:sum, numerote:bool}
for (const rows of [f1]) {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue;
    const n = norm(r[1]);
    if (!articleNames.has(n)) articleNames.set(n, { quantite: 0, numerote: false });
    const a = articleNames.get(n);
    a.quantite += parseFloat(r[3]) || 1;
    if (r[4] && String(r[4]).trim()) a.numerote = true;
  }
}
// Les carnets de Feuil2/Feuil3 sont numérotés
for (const rows of [f2, f3]) {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue;
    const n = norm(r[1]);
    if (!articleNames.has(n)) articleNames.set(n, { quantite: 0, numerote: true });
    articleNames.get(n).numerote = true;
  }
}

// ---------- Base ----------

const db = initDB();

const result = { articles: 0, mouvements: 0, series: 0, localites: 0 };

db.transaction(() => {
  // --- 1. Vider les données (conserve users, localites, categories, fournisseurs) ---
  db.exec(`
    DELETE FROM commande_articles;
    DELETE FROM commandes;
    DELETE FROM fiche_entree_photos;
    DELETE FROM fiche_entree_articles;
    DELETE FROM fiches_entree;
    DELETE FROM fiche_reception_articles;
    DELETE FROM fiches_reception;
    DELETE FROM retours_carnets;
    DELETE FROM mouvements;
    DELETE FROM series_numeros;
    DELETE FROM articles;
    DELETE FROM sqlite_sequence WHERE name IN
      ('articles','mouvements','fiches_reception','fiche_reception_articles',
       'fiches_entree','fiche_entree_articles','fiche_entree_photos',
       'series_numeros','retours_carnets','commandes','commande_articles');
  `);

  // --- 2. Importer les articles ---
  const usedRefs = new Set();
  const insertArticle = db.prepare(`
    INSERT INTO articles (reference, nom, categorie_id, type_article, unite, stock_min, stock_actuel)
    VALUES (?, ?, ?, ?, 'piece', 5, 0)
  `);
  const articleIds = new Map(); // normName -> id
  for (const [n, info] of articleNames) {
    const ref = makeRef(n, usedRefs);
    const r = insertArticle.run(ref, n, categoryIdFor(n, db), info.numerote ? 'numerote' : 'standard');
    articleIds.set(n, r.lastInsertRowid);
    result.articles++;
  }

  // --- 3. Créer les localités manquantes ---
  const locIds = new Map(); // normName -> id
  const getLoc = (name) => {
    const n = norm(name);
    if (!n) return null;
    if (locIds.has(n)) return locIds.get(n);
    let row = db.prepare('SELECT id FROM localites WHERE nom = ?').get(n);
    if (!row) {
      const pays = ['Accra', 'Cotonou', 'Lome', 'Ouagadougou', 'Bamako'].includes(n) ? 'International' : 'Niger';
      const type = pays === 'International' ? 'international' : 'national';
      const r = db.prepare('INSERT INTO localites (nom, type, pays) VALUES (?, ?, ?)').run(n, type, pays);
      row = { id: r.lastInsertRowid };
      result.localites++;
    }
    locIds.set(n, row.id);
    return row.id;
  };

  // --- 4. Importer l'historique des sorties + séries ---
  const insertMvt = db.prepare(`
    INSERT INTO mouvements (article_id, type, quantite, motif, localite_id, numero_debut, numero_fin, date)
    VALUES (?, 'sortie', ?, 'Import historique 2026', ?, ?, ?, ?)
  `);
  const insertSerie = db.prepare(`
    INSERT INTO series_numeros (article_id, numero_debut, numero_fin, quantite, source_type, source_id, date)
    VALUES (?, ?, ?, 1, 'sortie', ?, ?)
  `);

  // Feuil1 : journal des sorties
  for (let i = 1; i < f1.length; i++) {
    const r = f1[i];
    if (!r || !r[1]) continue;
    const n = norm(r[1]);
    const articleId = articleIds.get(n);
    if (!articleId) continue;
    const locId = getLoc(r[2]);
    const date = excelDate(r[0]) || new Date().toISOString().split('T')[0];
    const range = articleNames.get(n).numerote ? parseRange(r[4]) : null;
    const mvt = insertMvt.run(
      articleId, parseFloat(r[3]) || 1, locId,
      range ? String(range.debut) : null, range ? String(range.fin) : null, date
    );
    result.mouvements++;
    if (range) {
      insertSerie.run(articleId, String(range.debut), String(range.fin), mvt.lastInsertRowid, date);
      result.series++;
    }
  }

  // Feuil2 / Feuil3 : carnets numérotés (1 ligne = 1 carnet, série de 50 tickets)
  for (const rows of [f2, f3]) {
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[1]) continue;
      const n = norm(r[1]);
      const articleId = articleIds.get(n);
      if (!articleId) continue;
      const locId = getLoc(r[2]);
      const date = excelDate(r[0]) || new Date().toISOString().split('T')[0];
      const debut = parseInt(r[3], 10);
      if (isNaN(debut)) continue;
      const fin = debut + 49;
      const mvt = insertMvt.run(articleId, 1, locId, String(debut), String(fin), date);
      result.mouvements++;
      insertSerie.run(articleId, String(debut), String(fin), mvt.lastInsertRowid, date);
      result.series++;
    }
  }
})();

// ---------- Rapport ----------

const counts = {
  articles: db.prepare('SELECT COUNT(*) c FROM articles').get().c,
  mouvements: db.prepare('SELECT COUNT(*) c FROM mouvements').get().c,
  series: db.prepare('SELECT COUNT(*) c FROM series_numeros').get().c,
  localites: db.prepare('SELECT COUNT(*) c FROM localites').get().c,
  numerotes: db.prepare("SELECT COUNT(*) c FROM articles WHERE type_article = 'numerote'").get().c,
  stockTotal: db.prepare('SELECT COALESCE(SUM(stock_actuel),0) s FROM articles').get().s
};

console.log('=== IMPORT TERMINE ===');
console.log('Articles importes        :', result.articles, '(dont numerotes:', counts.numerotes + ')');
console.log('Localites creees         :', result.localites, '(total localites:', counts.localites + ')');
console.log('Mouvements sortie importe:', result.mouvements);
console.log('Series de numeros        :', result.series);
console.log('--- Base ---');
console.log('Articles en base         :', counts.articles);
console.log('Mouvements en base       :', counts.mouvements);
console.log('Series en base           :', counts.series);
console.log('Stock total initial      :', counts.stockTotal, '(0 = stock a renseigner via les entrees)');
console.log('Fichier source           :', path.basename(EXCEL));

db.close();
