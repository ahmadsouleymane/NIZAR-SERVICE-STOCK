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

// Variantes connues du fichier source qui designent le meme article (au-dela
// de la simple casse, deja geree ci-dessous) : on les fusionne explicitement
// plutot que de deviner une regle generale singulier/pluriel (risque de fusionner
// a tort des articles reellement distincts).
const ALIASES = {
  'Enveloppes A4': 'Enveloppe A4'
};

function norm(s) {
  let n = String(s || '').trim().replace(/\s+/g, ' ');
  if (n && n === n.toUpperCase() && n !== n.toLowerCase()) {
    // Chaine entierement en MAJUSCULES dans le fichier source (ex: "SERVICE ACHAT",
    // "NIAMEY") : on capitalise chaque mot pour matcher la forme deja utilisee
    // ailleurs ("Service Achat"), plutot que de creer un doublon (bug observe :
    // "NIAMEY" et "Niamey" importes comme deux localites distinctes).
    n = n.toLowerCase().replace(/(^|\s)([a-zà-öø-ÿ])/g, (m, sep, c) => sep + c.toUpperCase());
  } else {
    n = n.replace(/^./, (c) => c.toUpperCase());
  }
  return ALIASES[n] || n;
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

// "6001-6100" -> {debut:6001, fin:6100} ; "501" -> {debut:501, fin:501} ; sinon null.
// Strict : n'accepte que ces deux formes (apres nettoyage des espaces). Toute autre
// chaine (texte, plages multiples, notes...) retourne null plutot que de fusionner
// ses chiffres en un nombre errone (ex: "6001 a 6100" ne doit PAS devenir 60016100).
function parseRange(s) {
  const t = String(s || '').trim().replace(/\s+/g, '');
  if (!t) return null;
  const single = /^(\d+)$/.exec(t);
  if (single) return { debut: parseInt(single[1], 10), fin: parseInt(single[1], 10) };
  const range = /^(\d+)-(\d+)$/.exec(t);
  if (range) return { debut: parseInt(range[1], 10), fin: parseInt(range[2], 10) };
  return null;
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
// Feuil2/Feuil3 (carnets numerotes) sont optionnelles : absentes du fichier
// courant a une seule feuille, presentes dans l'ancien classeur multi-feuilles.
const f2 = wb.Sheets['Feuil2'] ? XLSX.utils.sheet_to_json(wb.Sheets['Feuil2'], { header: 1 }) : [];
const f3 = wb.Sheets['Feuil3'] ? XLSX.utils.sheet_to_json(wb.Sheets['Feuil3'], { header: 1 }) : [];
if (!f2.length && !f3.length) {
  console.log('(Feuil2/Feuil3 absentes du fichier — carnets numerotes issus uniquement de Feuil1)');
}

// Dernière date réelle du fichier — utilisée comme repli pour les lignes sans date
// (plutot que la date du jour, pour ne pas creer de faux mouvements « d'aujourd'hui »)
let lastSerial = 0;
for (const rows of [f1, f2, f3]) {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r && typeof r[0] === 'number' && r[0] > lastSerial) lastSerial = r[0];
  }
}
const lastDate = excelDate(lastSerial) || new Date().toISOString().split('T')[0];

// --- Articles (libellés uniques normalisés) ---
// Les numeros de souche ne concernent QUE les billets, carnets et bons EFFECTIVEMENT
// numerotes dans le fichier source : on se base sur la presence reelle d'une plage
// de numeros valide (colonne Numeros) plutot que sur le nom de l'article, pour eviter
// deux erreurs symetriques : un faux positif sur nom ("Protege billets" contient
// "billet" mais n'a jamais de numero) et un faux negatif sur nom ("Bon de commande"
// ne contient ni "billet" ni "carnet" mais porte bien des plages de numeros).
const articleNames = new Map(); // normName -> {quantite:sum, numerote:bool}
for (const rows of [f1]) {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[1]) continue;
    const n = norm(r[1]);
    if (!articleNames.has(n)) articleNames.set(n, { quantite: 0, numerote: false });
    articleNames.get(n).quantite += parseFloat(r[3]) || 1;
    if (parseRange(r[4])) articleNames.get(n).numerote = true;
  }
}
// Les carnets de Feuil2/Feuil3 sont des billets/carnets numérotés
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
    VALUES (?, ?, ?, ?, 'unite', 5, 0)
  `);
  const articleIds = new Map(); // normName -> id
  for (const [n, info] of articleNames) {
    const ref = makeRef(n, usedRefs);
    const r = insertArticle.run(ref, n, categoryIdFor(n, db), info.numerote ? 'numerote' : 'standard');
    articleIds.set(n, r.lastInsertRowid);
    result.articles++;
  }

  // --- 3. Créer les localités manquantes ---
  // Alias connus (fautes de frappe / abreviations du fichier source, au-dela de la
  // simple casse deja geree par norm()) : fusionnes vers le nom canonique deja en base.
  const LOC_ALIASES = {
    'Acrra': 'Accra',
    'Comptabilité': 'Comptabilite',
    'Rh': 'Ressources Humaines'
  };
  const locIds = new Map(); // normName -> id
  const getLoc = (name) => {
    let n = norm(name);
    n = LOC_ALIASES[n] || n;
    // Localite vide dans le fichier source : rattachee a « Destination inconnue »
    // plutot que NULL, pour rester compatible avec fiches_reception.localite_id (NOT NULL).
    if (!n) n = 'Destination inconnue';
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
    const date = excelDate(r[0]) || lastDate;
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
      const date = excelDate(r[0]) || lastDate;
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
