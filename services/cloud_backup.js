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

// L'API Contents n'inclut le contenu en base64 QUE pour les fichiers < ~1 Mo :
// au-delà, `content` est vide meme si `size` est correct. Pour les gros fichiers
// (notre base grossit avec l'historique), on recupere le blob via l'API Git Data,
// qui supporte jusqu'a 100 Mo.
async function githubGetBlob(sha) {
  const res = await fetch(GITHUB_API + '/repos/' + REPO + '/git/blobs/' + sha, {
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error('GitHub GET blob ' + res.status + ' (' + sha + ')');
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
  // Fichier > ~1 Mo : l'API Contents ne renvoie pas `content`, il faut passer
  // par l'API Git Data (blobs) pour recuperer les octets reels.
  let base64Content = meta.content;
  if (!base64Content) {
    const blob = await githubGetBlob(meta.sha);
    base64Content = blob.content;
  }
  if (!base64Content) throw new Error('Contenu de la sauvegarde introuvable (fichier vide cote GitHub ?).');

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(base64Content, 'base64'));
  const written = fs.statSync(DB_FILE).size;
  if (written === 0) throw new Error('Fichier restauré vide (0 octet) — restauration annulée.');
  console.log('[backup] Base restaurée depuis GitHub (' + written + ' octets).');
  return true;
}

function countArticles(db) {
  try { return db.prepare('SELECT COUNT(*) c FROM articles').get().c || 0; } catch (e) { return -1; }
}

// Compte quelques totaux-cles pour comparer « richesse » de deux bases (voir
// garde-fou anti split-brain dans save()). Tolerant aux tables absentes (ancien
// schema) : renvoie 0 pour ce qui n'existe pas plutot que d'echouer.
function summarize(db) {
  const c = (sql) => { try { return db.prepare(sql).get().c || 0; } catch (e) { return 0; } };
  return {
    articles: c('SELECT COUNT(*) c FROM articles'),
    categories: c('SELECT COUNT(*) c FROM categories'),
    fiches: c('SELECT COUNT(*) c FROM fiches_reception'),
    mouvements: c('SELECT COUNT(*) c FROM mouvements')
  };
}

// === Sauvegarde ===
// Snapshot cohérent via VACUUM INTO (sans corrompre la base vivante), puis PUT GitHub.
async function save(db, reason) {
  if (!enabled()) return;
  // GARDE-FOU 1 : ne jamais écraser une sauvegarde réelle par une base vide (seed).
  // Un serveur qui démarre sans restauration réussie aurait 0 article et écraserait
  // sinon les vraies données à chaque sauvegarde périodique.
  const n = countArticles(db);
  if (n === 0) {
    console.log('[backup] Base locale sans articles — sauvegarde ignorée (préserve la sauvegarde réelle).');
    return;
  }
  // Nom unique : VACUUM INTO refuse d'ecrire si le fichier cible existe deja.
  // Un nom fixe reutilise entre appels bloquerait TOUTE sauvegarde future des
  // qu'un appel precedent est interrompu (crash, SIGKILL) sans nettoyer son tmp.
  const tmp = DB_FILE + '.backup-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.tmp';
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    // GARDE-FOU 2 : anti « split-brain ». Si deux instances tournent en parallele
    // (ex. redeploiement en cours, ou script local avec les memes identifiants),
    // chacune sauvegarde la sienne toutes les ~3 min et peut ecraser les vraies
    // donnees de l'autre. On compare a la sauvegarde distante actuelle : si la
    // base locale a moins de categories OU moins de fiches que ce qui est deja
    // sauvegarde, on n'ecrase pas (on log un avertissement a la place).
    const existing = await githubGet(REMOTE_PATH);
    if (existing) {
      let existingDb = null;
      try {
        let base64 = existing.content;
        if (!base64) { const blob = await githubGetBlob(existing.sha); base64 = blob.content; }
        if (base64) {
          const tmpCheck = DB_FILE + '.check-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.tmp';
          fs.writeFileSync(tmpCheck, Buffer.from(base64, 'base64'));
          const Database = require('better-sqlite3');
          existingDb = new Database(tmpCheck, { readonly: true });
          const remote = summarize(existingDb);
          const local = summarize(db);
          existingDb.close();
          fs.unlinkSync(tmpCheck);
          // Seuil DRAMATIQUE uniquement (ex: 0 fiches alors qu'il y en avait 1213,
          // le cas reel qui a cause l'incident) — pas une simple baisse de 1 ou 2,
          // qui correspond a une suppression admin legitime (le bouton Supprimer
          // d'une fiche/entree existe et doit pouvoir se sauvegarder normalement).
          const chuteFiches = remote.fiches > 0 && local.fiches < remote.fiches * 0.5;
          const chuteMouvements = remote.mouvements > 0 && local.mouvements < remote.mouvements * 0.5;
          if (chuteFiches || chuteMouvements) {
            console.warn('[backup] Chute brutale detectee (fiches ' +
              local.fiches + ' vs ' + remote.fiches + ', mouvements ' + local.mouvements + ' vs ' + remote.mouvements +
              ') — sauvegarde ignoree, probable base non restauree/differente. Investiguer avant de forcer.');
            return;
          }
        }
      } catch (e) { /* comparaison impossible : on procede quand meme a la sauvegarde */ }
    }

    db.exec("VACUUM INTO '" + tmp.replace(/'/g, "''") + "'");
    const content = fs.readFileSync(tmp, 'base64');
    await githubPut(REMOTE_PATH, content, existing ? existing.sha : undefined,
      'backup ' + (reason || 'periodique') + ' — ' + new Date().toISOString());
    console.log('[backup] Base sauvegardée sur GitHub (' + repoPath() + ') — ' + (reason || 'periodique') + '.');
  } catch (err) {
    console.error('[backup] Échec de la sauvegarde :', err.message);
  } finally {
    if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

// === Sauvegarde reactive (debounce) ===
// Declenchee apres CHAQUE ecriture (creation/modif/suppression, quelle que soit
// la route) via le middleware de server.js, plutot que d'attendre l'intervalle
// periodique de 3 min. Debounce court pour regrouper les modifications rapides
// (ex: plusieurs lignes d'une fiche) en une seule sauvegarde au lieu d'une par
// requete.
let pendingSaveTimer = null;
const DEBOUNCE_MS = (parseInt(process.env.GH_BACKUP_DEBOUNCE_SEC, 10) || 15) * 1000;

function scheduleSave(db) {
  if (!enabled()) return;
  if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    save(db, 'auto').catch((err) => console.error('[backup] Sauvegarde reactive echouee :', err.message));
  }, DEBOUNCE_MS);
  pendingSaveTimer.unref();
}

// A l'arret, s'assurer qu'une sauvegarde programmee non encore executee parte
// quand meme (le handler SIGTERM de start() appelle deja save() separement,
// ceci n'est qu'un filet pour annuler le timer en attente proprement).
function flushPendingSave() {
  if (pendingSaveTimer) { clearTimeout(pendingSaveTimer); pendingSaveTimer = null; }
}

// === Poussée initiale (une seule fois, depuis une machine locale) ===
async function pushInitial() {
  if (!enabled()) throw new Error('GH_BACKUP_REPO / GH_BACKUP_TOKEN manquants.');
  if (!fs.existsSync(DB_FILE)) throw new Error('Base locale introuvable : ' + DB_FILE);
  const Database = require('better-sqlite3');
  const db = new Database(DB_FILE, { readonly: true });
  const tmp = DB_FILE + '.init-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.tmp';
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
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
  const timer = setInterval(() => {
    save(db, 'periodique').catch((err) => console.error('[backup] Sauvegarde periodique echouee :', err.message));
  }, INTERVAL_MS);
  timer.unref();
  // Sauvegarde à l'arrêt (Render envoie SIGTERM au redéploiement)
  process.on('SIGTERM', () => {
    save(db, 'arret')
      .catch((err) => console.error('[backup] Sauvegarde a l\'arret echouee :', err.message))
      .finally(() => process.exit(0));
  });
}

module.exports = { enabled, restore, save, pushInitial, start, repoPath, scheduleSave, flushPendingSave };
