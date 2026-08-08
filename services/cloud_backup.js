// services/cloud_backup.js — Sauvegarde de la base SQLite vers un dépôt GitHub privé.
// Nécessaire sur les hébergeurs SANS disque persistant (plan gratuit Render) :
// la base vit sur un disque éphémère. On la restaure depuis GitHub au démarrage
// et on la pousse en continu (toutes les ~3 min + à l'arrêt SIGTERM) pour ne
// jamais perdre les données malgré les redéploiements.
// Désactivé en local si GH_BACKUP_REPO n'est pas défini.
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const REPO = process.env.GH_BACKUP_REPO;                          // ex: "owner/repo"
const TOKEN = process.env.GH_BACKUP_TOKEN;
const REMOTE_PATH = process.env.GH_BACKUP_PATH || 'data/nizar.db';
const DB_FILE = paths.dbPath;
const INTERVAL_MS = (parseInt(process.env.GH_BACKUP_INTERVAL_MIN, 10) || 3) * 60 * 1000;

const GITHUB_API = process.env.GH_BACKUP_API || 'https://api.github.com';

function enabled() {
  return !!(REPO && TOKEN);
}

function repoPath() {
  return REPO + ':' + REMOTE_PATH;
}

// === Requêtes GitHub ===
async function githubGet(filePath) {
  const res = await fetch(GITHUB_API + '/repos/' + REPO + '/contents/' + filePath, {
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(20000)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub GET ' + res.status + ' (' + filePath + ')');
  return res.json();
}

async function githubPut(filePath, base64Content, sha, message) {
  const body = { message: message, content: base64Content };
  if (sha) body.sha = sha;
  const res = await fetch(GITHUB_API + '/repos/' + REPO + '/contents/' + filePath, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('GitHub PUT ' + res.status + ': ' + String(txt).slice(0, 200));
  }
  return res.json();
}

// === Restauration au démarrage ===
// Restaure la base depuis GitHub SEULEMENT si le fichier local n'a pas de
// données réelles (base absente ou vierge issue du seed). Une base locale avec
// des articles est toujours conservée.
function dbHasUserData() {
  if (!fs.existsSync(DB_FILE)) return false;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(DB_FILE, { readonly: true });
    const c = db.prepare('SELECT COUNT(*) c FROM articles').get().c;
    db.close();
    return c > 0;
  } catch (e) { return false; }
}

async function restore() {
  if (!enabled()) return false;
  if (dbHasUserData()) {
    console.log('[backup] Base locale avec données — restauration ignorée.');
    return false;
  }
  const meta = await githubGet(REMOTE_PATH);
  if (!meta) {
    console.log('[backup] Aucune sauvegarde GitHub (' + repoPath() + ') — base vierge au départ.');
    return false;
  }
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(meta.content, 'base64'));
  console.log('[backup] Base restaurée depuis GitHub (' + meta.size + ' octets).');
  return true;
}

// === Sauvegarde ===
// Snapshot cohérent via VACUUM INTO (sans corrompre la base vivante), puis PUT GitHub.
async function save(db, reason) {
  if (!enabled()) return;
  const tmp = DB_FILE + '.backup.tmp';
  try {
    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
    const content = fs.readFileSync(tmp, 'base64');
    const existing = await githubGet(REMOTE_PATH);
    await githubPut(REMOTE_PATH, content, existing ? existing.sha : undefined,
      'backup ' + (reason || 'periodique') + ' — ' + new Date().toISOString());
    console.log('[backup] Base sauvegardée sur GitHub (' + repoPath() + ') — ' + (reason || 'periodique') + '.');
  } catch (err) {
    console.error('[backup] Échec de la sauvegarde :', err.message);
  } finally {
    if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

// === Poussée initiale (une seule fois, depuis une machine locale) ===
async function pushInitial() {
  if (!enabled()) throw new Error('GH_BACKUP_REPO / GH_BACKUP_TOKEN manquants.');
  if (!fs.existsSync(DB_FILE)) throw new Error('Base locale introuvable : ' + DB_FILE);
  const Database = require('better-sqlite3');
  const db = new Database(DB_FILE, { readonly: true });
  const tmp = DB_FILE + '.init.tmp';
  try {
    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
    const content = fs.readFileSync(tmp, 'base64');
    const existing = await githubGet(REMOTE_PATH);
    await githubPut(REMOTE_PATH, content, existing ? existing.sha : undefined,
      'backup initial — ' + new Date().toISOString());
    console.log('[backup] Base initiale poussée sur GitHub (' + fs.statSync(tmp).size + ' octets).');
  } finally {
    db.close();
    if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

// === Démarrage du service (côté serveur) ===
// La restauration est faite par server.js AVANT initDB (voir serveur) — ici on
// gère uniquement les sauvegardes périodiques et à l'arrêt.
function start(db) {
  if (!enabled()) {
    console.log('[backup] GH_BACKUP_REPO non défini — synchro GitHub désactivée (mode local).');
    return;
  }
  // Sauvegarde périodique
  const timer = setInterval(() => { save(db, 'periodique').catch(() => {}); }, INTERVAL_MS);
  timer.unref();
  // Sauvegarde à l'arrêt (Render envoie SIGTERM au redéploiement)
  process.on('SIGTERM', () => {
    save(db, 'arret').catch(() => {}).finally(() => process.exit(0));
  });
}

module.exports = { enabled, restore, save, pushInitial, start, repoPath };
