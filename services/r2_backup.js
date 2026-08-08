// services/r2_backup.js — Sauvegarde des uploads (photos, PDF) vers Cloudflare R2.
// Sur les hébergeurs SANS disque persistant (plan gratuit Render), le dossier
// d'uploads est éphémère. Ce service :
//   - restaure au démarrage les fichiers depuis R2 (télécharge les manquants) ;
//   - synchronise en continu le dossier local vers R2 (toutes les ~5 min + à l'arrêt).
// Désactivé en local si les variables R2_* ne sont pas définies.
const fs = require('fs');
const path = require('path');
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const INTERVAL_MS = (parseInt(process.env.R2_SYNC_INTERVAL_MIN, 10) || 5) * 60 * 1000;

function enabled() {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

let client = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      forcePathStyle: true
    });
  }
  return client;
}

// Liste toutes les clés du bucket (gère la pagination de 1000 objets)
async function listAllKeys() {
  const keys = [];
  let token;
  do {
    const res = await s3().send(new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      ContinuationToken: token
    }));
    for (const o of res.Contents || []) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function getObject(key) {
  const res = await s3().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function putObject(key, body) {
  await s3().send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body }));
}

// Parcourt le dossier local (récursif) → chemins relatifs (séparateur '/')
function walk(uploadDir, dir, base, out) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (e) { return; }
  for (const name of entries) {
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) walk(uploadDir, full, base, out);
    else if (st.size > 0) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// Restaure depuis R2 : télécharge les fichiers manquants (ou vides) localement.
// Retourne l'ensemble des clés connues du bucket (pour la synchro suivante).
async function restore(uploadDir) {
  const keys = await listAllKeys();
  let restored = 0;
  for (const key of keys) {
    const local = path.join(uploadDir, key);
    const missing = !fs.existsSync(local) || fs.statSync(local).size === 0;
    if (missing) {
      try {
        const data = await getObject(key);
        fs.mkdirSync(path.dirname(local), { recursive: true });
        fs.writeFileSync(local, data);
        restored++;
      } catch (e) { console.error('[r2] Échec téléchargement', key, ':', e.message); }
    }
  }
  console.log('[r2] Restauration : ' + restored + ' fichier(s) téléchargé(s) depuis R2 (' + keys.length + ' en tout).');
  return new Set(keys);
}

// Synchronise local → R2 : upload des fichiers pas encore présents dans le bucket.
async function syncUploads(uploadDir, knownKeys) {
  const localFiles = walk(uploadDir, uploadDir, uploadDir, []);
  let uploaded = 0;
  for (const rel of localFiles) {
    if (knownKeys.has(rel)) continue;
    try {
      await putObject(rel, fs.readFileSync(path.join(uploadDir, rel)));
      knownKeys.add(rel);
      uploaded++;
    } catch (e) { console.error('[r2] Échec upload', rel, ':', e.message); }
  }
  if (uploaded > 0) console.log('[r2] ' + uploaded + ' fichier(s) synchronisé(s) vers R2.');
  return uploaded;
}

// Démarrage du service (côté serveur)
function start(uploadDir) {
  if (!enabled()) {
    console.log('[r2] Variables R2_* non définies — synchro photos R2 désactivée (mode local).');
    return;
  }
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  let knownKeys = null;
  // Restauration au démarrage (non bloquante)
  restore(uploadDir).then(keys => { knownKeys = keys; }).catch(err =>
    console.error('[r2] Restauration impossible :', err.message));

  // Synchronisation périodique local → R2
  const timer = setInterval(async () => {
    if (!knownKeys) { try { knownKeys = new Set(await listAllKeys()); } catch (e) { return; } }
    try { await syncUploads(uploadDir, knownKeys); } catch (e) { console.error('[r2] Synchro :', e.message); }
  }, INTERVAL_MS);
  timer.unref();

  // Dernière synchro à l'arrêt (Render envoie SIGTERM au redéploiement)
  process.on('SIGTERM', () => {
    (async () => {
      if (!knownKeys) { try { knownKeys = new Set(await listAllKeys()); } catch (e) { knownKeys = new Set(); } }
      try { await syncUploads(uploadDir, knownKeys); } catch (e) {}
    })().finally(() => process.exit(0));
  });
}

module.exports = { enabled, restore, syncUploads, start, walk };
