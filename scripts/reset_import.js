// scripts/reset_import.js — Réinitialise les données de test et importe les
// articles + sorties depuis la FEUILLE 1 de l'Excel fourni.
//
//  - Supprime : mouvements, fiches de réception, entrées, retours, commandes,
//    séries, inventaires, articles, fournisseurs. (users / categories / localites conservés)
//  - Importe les ARTICLES (noms distincts de la feuille 1) + les SORTIES
//    historiques regroupées en fiches (par date + destination), statut « envoyee ».
//
// Usage : node scripts/reset_import.js
const path = require('path');
const initDB = require('../database/init');
const XLSX = require('xlsx');
const paths = require('../services/paths');
const { recordSerie, parseNumero } = require('../services/series');

const db = initDB(paths.dbPath);

// ============================================================
// 1. Nettoyage complet des données de test
// ============================================================
console.log('— Nettoyage des données...');
db.exec(`
  DELETE FROM audit_log;
  DELETE FROM fiche_reception_articles;
  DELETE FROM fiches_reception;
  DELETE FROM fiche_entree_photos;
  DELETE FROM fiche_entree_articles;
  DELETE FROM fiches_entree;
  DELETE FROM retours_carnets;
  DELETE FROM commande_articles;
  DELETE FROM commandes;
  DELETE FROM series_numeros;
  DELETE FROM mouvements;
  DELETE FROM inventaires;
  DELETE FROM articles;
  DELETE FROM fournisseurs;
`);
db.exec(`DELETE FROM sqlite_sequence WHERE name IN
  ('articles','fournisseurs','mouvements','fiches_reception','fiche_reception_articles',
   'series_numeros','commandes','commande_articles','fiches_entree','fiche_entree_articles','retours_carnets','inventaires')`);

// ============================================================
// 2. Lecture de la feuille 1 (registre des sorties)
// ============================================================
const wb = XLSX.readFile(path.join(__dirname, '..', 'Carnets et fourniture_044814 (1).xlsx'));
const ws = wb.Sheets['Feuil1'];
if (!ws) { console.error('Feuille « Feuil1 » introuvable.'); process.exit(1); }
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Lignes exploitables : [date(serial), article, destination, quantité, plage n°]
const data = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const article = String(r[1] || '').trim();
  const dest = String(r[2] || '').trim();
  if (!article || !dest) continue;
  data.push({
    serial: r[0],
    article,
    dest,
    qty: parseInt(r[3], 10) || 0,
    range: String(r[4] || '').trim()
  });
}
console.log('Lignes de sortie lues :', data.length);

// ============================================================
// 3. Import des ARTICLES (noms distincts)
// ============================================================
function refFromName(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'ART';
}

// Clé normalisée (insensible à la casse) pour éviter les doublons (« Bon de
// commande » = « bon de commande »).
const normKey = (s) => String(s).toLowerCase().trim();

// Pass 1 : détecter type + taille de lot par article (dédoublonné par casse)
const meta = {};
const displayName = {};
for (const d of data) {
  const k = normKey(d.article);
  if (!displayName[k]) displayName[k] = d.article;
  if (!meta[k]) meta[k] = { hasRange: false, lots: [] };
  if (d.range) {
    const parts = d.range.split('-');
    if (parts.length === 2 && d.qty > 0) {
      const a = parseNumero(parts[0]); const b = parseNumero(parts[1]);
      if (a !== null && b !== null && b >= a) {
        const span = (b - a + 1) / d.qty;
        if (span >= 100) meta[k].lots.push(500);
        else if (span >= 25) meta[k].lots.push(50);
        else meta[k].lots.push(1);
      }
    }
    meta[k].hasRange = true;
  }
}

function dominantLot(key) {
  const lots = meta[key] && meta[key].lots;
  if (!lots || !lots.length) return '';
  const c500 = lots.filter(x => x === 500).length;
  const c50 = lots.filter(x => x === 50).length;
  return c500 >= c50 ? 'Lot de 500' : 'Lot de 50';
}

function dominantLot(articleName) {
  const lots = meta[articleName] && meta[articleName].lots;
  if (!lots || !lots.length) return '';
  const c500 = lots.filter(x => x === 500).length;
  const c50 = lots.filter(x => x === 50).length;
  return c500 >= c50 ? 'Lot de 500' : 'Lot de 50';
}

const insertArticle = db.prepare(`
  INSERT INTO articles (reference, nom, type_article, unite, stock_min, stock_actuel, prix_unitaire, created_at, updated_at)
  VALUES (?, ?, ?, ?, 0, 0, 0, datetime('now','localtime'), datetime('now','localtime'))
`);
const articleIdByName = {};
const refTaken = {};
const keys = Object.keys(meta).sort();
for (const k of keys) {
  const name = displayName[k];
  const numerote = meta[k].hasRange;
  const unite = numerote ? (dominantLot(k) || 'Lot de 500') : '';
  let ref = refFromName(name);
  if (refTaken[ref]) { ref = ref + '-' + (refTaken[ref] + 1); }
  refTaken[ref] = (refTaken[ref] || 0) + 1;
  const r = insertArticle.run(ref, name, numerote ? 'numerote' : 'standard', unite);
  articleIdByName[k] = r.lastInsertRowid;
}
console.log('Articles importés :', keys.length);

// ============================================================
// 4. Import des SORTIES historiques (fiches par date + destination)
// ============================================================
const locByName = {};
db.prepare('SELECT id, nom FROM localites').all().forEach(l => { locByName[String(l.nom).trim()] = l.id; });

// Grouper par (date, destination)
const groups = new Map();
for (const d of data) {
  const key = String(d.serial) + '|' + d.dest;
  if (!groups.has(key)) groups.set(key, { serial: d.serial, dest: d.dest, lignes: [] });
  groups.get(key).lignes.push(d);
}
console.log('Fiches (date + destination) :', groups.size);

function serialToDate(serial) {
  if (!serial && serial !== 0) return null;
  const ms = Math.round((Number(serial) - 25569) * 86400000);
  const dt = new Date(ms);
  if (isNaN(dt.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes()) + ':00';
}

function nextRef() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'fiches_reception'").get();
  const next = (seq ? seq.seq : 0) + 1;
  return 'FR-' + y + m + '-' + String(next).padStart(3, '0');
}

const insertFiche = db.prepare(`
  INSERT INTO fiches_reception (reference, date_envoi, localite_id, user_id, statut, notes, date_creation, numero_facture)
  VALUES (?, ?, ?, NULL, 'envoyee', ?, datetime('now','localtime'), ?)
`);
const insertLigne = db.prepare(`
  INSERT INTO fiche_reception_articles (fiche_id, article_id, quantite, unite, numero_debut, numero_fin)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let skippedDest = 0;
let nbFiches = 0;
let nbLignes = 0;

for (const [key, g] of groups) {
  const locId = locByName[g.dest];
  if (!locId) { skippedDest++; continue; }

  const dateEnvoi = serialToDate(g.serial) || null;
  const reference = nextRef();
  const ficheId = insertFiche.run(reference, dateEnvoi, locId, 'Import historique (' + data.length + ' lignes)', 'FACT-' + reference).lastInsertRowid;

  for (const d of g.lignes) {
    const articleId = articleIdByName[normKey(d.article)];
    if (!articleId) continue;
    let debut = null, fin = null;
    const parts = d.range.split('-');
    if (parts.length === 2) { debut = parts[0].trim(); fin = parts[1].trim(); }
    // Unité de la ligne : lot (500/50) pour les billets, sinon vide (le PDF affiche « - »)
    let unite = '';
    if (debut && fin && d.qty > 0) {
      const a = parseNumero(debut), b = parseNumero(fin);
      if (a !== null && b !== null && b >= a) {
        const span = (b - a + 1) / d.qty;
        unite = span >= 100 ? 'Lot de 500' : (span >= 25 ? 'Lot de 50' : '');
      }
    }
    insertLigne.run(ficheId, articleId, d.qty || 1, unite, debut, fin);
    // Enregistrer la plage dans series_numeros (empêche de ré-envoyer un lot déjà envoyé)
    if (debut && fin) recordSerie(db, articleId, debut, fin, d.qty || 1, 'sortie', ficheId);
    nbLignes++;
  }
  nbFiches++;
}

console.log('Fiches importées :', nbFiches, '| lignes :', nbLignes, '| destinations inconnues ignorées :', skippedDest);

// ============================================================
// Résumé final
// ============================================================
const nbArticles = db.prepare('SELECT COUNT(*) c FROM articles').get().c;
const nbNumerote = db.prepare("SELECT COUNT(*) c FROM articles WHERE type_article='numerote'").get().c;
const nbFichesTotal = db.prepare('SELECT COUNT(*) c FROM fiches_reception').get().c;
console.log('\n✔ Terminé.');
console.log('  Articles :', nbArticles, '(' + nbNumerote + ' numérotés/billets)');
console.log('  Fiches de sortie :', nbFichesTotal);
db.close();
