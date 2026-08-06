# Nizar Stock V2 — Entrées fournisseur, envois agences et archivage : Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à l'app Nizar Stock existante le module **Entrées fournisseur** (enregistrement sans impression + photos du bon de livraison/facture), le cycle **« OK — Retour reçu »** sur les envois agence (statut `signee`), et le **suivi précis des numéros de souche** (refus des chevauchements).

**Architecture:** Extension de l'existant — SQLite (better-sqlite3) + Express + SPA vanilla. Nouvelles tables `fiches_entree`, `fiche_entree_articles`, `fiche_entree_photos`, `series_numeros` ; colonnes `numero_debut`/`numero_fin`/`entree_id` ajoutées à `mouvements`. Service partagé `services/series.js` pour le contrôle des plages. Aucun changement de la mise en page PDF (l'entrée n'imprime rien).

**Tech Stack:** Node.js, Express 4, better-sqlite3, multer, vanilla JS (mobile-first). Aucun framework frontend, aucune dépendance ajoutée.

## Global Constraints

- Séparation stricte HTML/CSS/JS/backend (jamais de monofichier).
- Suivre les patterns du code existant (`routes/*.js`, `public/js/*.js`, services, `UI.modal`/`UI.toast`/`UI.confirm`).
- Aucune mention Claude/IA dans le code, les commits ou les métadonnées ; messages de commit en conventional-commit, en français.
- L'entrée fournisseur **n'imprime aucun PDF** (exigence métier). Seuls les envois agence ont un PDF (inchangé).
- Textes d'interface en français.
- Les champs `numero_debut`/`numero_fin` des articles numérotés sont saisis côté client et contrôlés côté serveur.

---

## Task 1: Migration base de données — nouvelles tables et colonnes

**Files:**
- Modify: `database/init.js`

**Interfaces:**
- Produces: tables `fiches_entree`, `fiche_entree_articles`, `fiche_entree_photos`, `series_numeros` ; colonnes `mouvements.numero_debut`, `mouvements.numero_fin`, `mouvements.entree_id`. Consommé par Task 2 (routes entrées) et Task 3 (fiches).

- [ ] **Step 1: Ajouter les nouvelles tables dans `db.exec`**

Dans `database/init.js`, après le bloc `CREATE TABLE IF NOT EXISTS commande_articles (...);` et avant la fermeture du template SQL (la ligne `` ` ``), ajouter :

```sql
    CREATE TABLE IF NOT EXISTS fiches_entree (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
      date_entree TEXT DEFAULT (datetime('now')),
      numero_bl TEXT,
      numero_facture TEXT,
      notes TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      statut TEXT NOT NULL DEFAULT 'validee' CHECK(statut IN ('validee','archivee')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fiche_entree_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiche_id INTEGER NOT NULL REFERENCES fiches_entree(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      quantite INTEGER NOT NULL DEFAULT 1,
      numero_debut TEXT,
      numero_fin TEXT,
      observation TEXT
    );

    CREATE TABLE IF NOT EXISTS fiche_entree_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiche_id INTEGER NOT NULL REFERENCES fiches_entree(id) ON DELETE CASCADE,
      fichier_path TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'autre' CHECK(type IN ('bl','facture','autre')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS series_numeros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      numero_debut TEXT NOT NULL,
      numero_fin TEXT NOT NULL,
      quantite INTEGER NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL CHECK(source_type IN ('entree','sortie','retour')),
      source_id INTEGER,
      date TEXT DEFAULT (datetime('now'))
    );
```

- [ ] **Step 2: Ajouter les colonnes au CREATE TABLE de `mouvements`**

Dans le même bloc SQL, remplacer la définition de `mouvements` pour inclure (après `commande_id INTEGER REFERENCES commandes(id) ON DELETE SET NULL,`) :

```sql
      entree_id INTEGER REFERENCES fiches_entree(id) ON DELETE SET NULL,
      numero_debut TEXT,
      numero_fin TEXT,
```

(conserver `date TEXT DEFAULT (datetime('now'))`, `created_at ...` inchangés).

- [ ] **Step 3: Ajouter la migration pour les bases existantes**

Après l'appel `db.exec(\`...\`)` et avant la section « Seeds », ajouter :

```js
  // Migration : ajouter les colonnes manquantes aux tables existantes (bases créées avant V2)
  function ensureColumn(db, table, column, ddl) {
    const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
    if (!cols.some((c) => c.name === column)) {
      db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + ddl);
    }
  }
  ensureColumn(db, 'mouvements', 'entree_id', 'INTEGER REFERENCES fiches_entree(id) ON DELETE SET NULL');
  ensureColumn(db, 'mouvements', 'numero_debut', 'TEXT');
  ensureColumn(db, 'mouvements', 'numero_fin', 'TEXT');
```

- [ ] **Step 4: Vérifier la migration**

Run: `node database/init.js`
Expected: « Base de donnees initialisee avec succes (v2). » sans erreur.

Run:
```bash
node -e "const initDB=require('./database/init'); const db=initDB(); const t=db.prepare('PRAGMA table_info(mouvements)').all().map(c=>c.name); console.log('mouvements a entree_id:', t.includes('entree_id'), '| numero_debut:', t.includes('numero_debut'), '| numero_fin:', t.includes('numero_fin')); console.log('tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'fiche%' OR name LIKE 'series%'\").all().map(r=>r.name).join(', ')); db.close();"
```
Expected: `mouvements a entree_id: true | numero_debut: true | numero_fin: true` et `tables: fiches_entree, fiche_entree_articles, fiche_entree_photos, series_numeros`.

- [ ] **Step 5: Commit**

```bash
git add database/init.js
git commit -m "feat: migration base de donnees — tables entrees, photos et series numeros"
```

---

## Task 2: Service séries + routes Entrées (backend)

**Files:**
- Create: `services/series.js`
- Create: `routes/entrees.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `mouvements.entree_id`/`numero_debut`/`numero_fin` (Task 1), `requireAdmin`/`authenticate` (middleware/auth.js), `articles.type_article` (existant).
- Produces:
  - `services/series.js` : `parseNumero(v)`, `checkOverlap(db, article_id, numero_debut, numero_fin, source_type)`, `recordSerie(db, article_id, numero_debut, numero_fin, quantite, source_type, source_id)`. Consommé par Task 3 (fiches).
  - `routes/entrees.js` : `GET /api/entrees`, `POST /api/entrees`, `GET /api/entrees/:id`, `POST /api/entrees/:id/photos`, `DELETE /api/entrees/:id`.

- [ ] **Step 1: Créer `services/series.js`**

```js
// services/series.js — Utilitaires de suivi des numeros de souche
function parseNumero(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? null : n;
}

/**
 * Verifie si une plage chevauche une plage existante du meme type d'operation
 * @returns {Object|null} la serie en conflit, ou null si aucune / pas de plage fournie
 */
function checkOverlap(db, article_id, numero_debut, numero_fin, source_type) {
  const d = parseNumero(numero_debut);
  const f = parseNumero(numero_fin);
  if (d === null || f === null) return null;
  if (d > f) throw new Error('Numero debut (' + d + ') superieur au numero fin (' + f + ').');
  return db.prepare(`
    SELECT s.id, s.numero_debut, s.numero_fin, s.source_type
    FROM series_numeros s
    WHERE s.article_id = ? AND s.source_type = ?
      AND CAST(s.numero_debut AS INTEGER) <= ?
      AND CAST(s.numero_fin AS INTEGER) >= ?
    LIMIT 1
  `).get(article_id, source_type, f, d) || null;
}

/**
 * Enregistre une plage dans series_numeros (no-op si pas de plage valide)
 */
function recordSerie(db, article_id, numero_debut, numero_fin, quantite, source_type, source_id) {
  const d = parseNumero(numero_debut);
  const f = parseNumero(numero_fin);
  if (d === null || f === null) return;
  db.prepare(`
    INSERT INTO series_numeros (article_id, numero_debut, numero_fin, quantite, source_type, source_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(article_id, String(d), String(f), quantite, source_type, source_id);
}

module.exports = { parseNumero, checkOverlap, recordSerie };
```

- [ ] **Step 2: Créer `routes/entrees.js`**

```js
// routes/entrees.js — Entrees fournisseur (enregistrement sans impression)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkOverlap, recordSerie } = require('../services/series');
const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: function(req, file, cb) {
    cb(null, 'photo-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

function generateRef(db) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const count = db.prepare("SELECT COUNT(*) as c FROM fiches_entree WHERE created_at >= date('now')").get().c;
  return 'FE-' + y + m + '-' + String(count + 1).padStart(3, '0');
}

// GET /api/entrees — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { fournisseur_id, statut, debut, fin } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (fournisseur_id) { where += ' AND fe.fournisseur_id = ?'; params.push(fournisseur_id); }
  if (statut) { where += ' AND fe.statut = ?'; params.push(statut); }
  if (debut) { where += ' AND fe.date_entree >= ?'; params.push(debut); }
  if (fin) { where += ' AND fe.date_entree <= ?'; params.push(fin + ' 23:59:59'); }

  const fiches = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom, u.username as cree_par,
      (SELECT COUNT(*) FROM fiche_entree_articles WHERE fiche_id = fe.id) as nb_lignes,
      (SELECT COUNT(*) FROM fiche_entree_photos WHERE fiche_id = fe.id) as nb_photos
    FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    LEFT JOIN users u ON fe.user_id = u.id
    ${where}
    ORDER BY fe.id DESC LIMIT 200
  `).all(...params);
  res.json({ fiches });
});

// GET /api/entrees/:id — detail (lignes + photos)
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom, u.username as cree_par
    FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    LEFT JOIN users u ON fe.user_id = u.id
    WHERE fe.id = ?
  `).get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });

  const lignes = db.prepare(`
    SELECT fea.*, a.nom as article_nom, a.reference, a.unite, a.type_article
    FROM fiche_entree_articles fea
    LEFT JOIN articles a ON fea.article_id = a.id
    WHERE fea.fiche_id = ?
  `).all(req.params.id);

  const photos = db.prepare('SELECT * FROM fiche_entree_photos WHERE fiche_id = ? ORDER BY id').all(req.params.id);
  res.json({ fiche, lignes, photos });
});

// POST /api/entrees — creer une entree (aucune impression)
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { fournisseur_id, numero_bl, numero_facture, notes, articles } = req.body;

  if (!articles || !articles.length) return res.status(400).json({ error: 'Au moins un article requis.' });

  if (fournisseur_id) {
    const f = db.prepare('SELECT id FROM fournisseurs WHERE id = ?').get(fournisseur_id);
    if (!f) return res.status(400).json({ error: 'Fournisseur introuvable.' });
  }

  for (let i = 0; i < articles.length; i++) {
    const qte = parseInt(articles[i].quantite, 10);
    if (isNaN(qte) || qte <= 0) return res.status(400).json({ error: 'Quantite invalide ligne ' + (i + 1) + '.' });
    articles[i].quantite = qte;
  }

  const reference = generateRef(db);
  let ficheId = null;

  try {
    const transaction = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO fiches_entree (reference, fournisseur_id, date_entree, numero_bl, numero_facture, notes, user_id, statut)
        VALUES (?, ?, datetime('now'), ?, ?, ?, ?, 'validee')
      `).run(reference, fournisseur_id || null, numero_bl || null, numero_facture || null, notes || null, req.user.id);
      ficheId = result.lastInsertRowid;

      const insertLigne = db.prepare(`
        INSERT INTO fiche_entree_articles (fiche_id, article_id, quantite, numero_debut, numero_fin, observation)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const insertMvt = db.prepare(`
        INSERT INTO mouvements (article_id, type, quantite, motif, user_id, fournisseur_id, entree_id, numero_debut, numero_fin, date)
        VALUES (?, 'entree', ?, 'Entree fournisseur — ' || ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      const updateStock = db.prepare(`
        UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime('now') WHERE id = ?
      `);

      for (const art of articles) {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.article_id);
        if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');

        if (article.type_article === 'numerote') {
          const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'entree');
          if (overlap) throw new Error('Chevauchement pour ' + article.nom + ' : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
          recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'entree', ficheId);
        }

        insertLigne.run(ficheId, art.article_id, art.quantite, art.numero_debut || null, art.numero_fin || null, art.observation || null);
        insertMvt.run(art.article_id, art.quantite, reference, req.user.id, fournisseur_id || null, ficheId, art.numero_debut || null, art.numero_fin || null);
        updateStock.run(art.quantite, art.article_id);
      }
    });

    transaction();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(ficheId);
  const lignes = db.prepare(`
    SELECT fea.*, a.nom as article_nom, a.unite FROM fiche_entree_articles fea
    LEFT JOIN articles a ON fea.article_id = a.id WHERE fea.fiche_id = ?
  `).all(ficheId);
  res.status(201).json({ fiche, lignes, message: 'Entree enregistree (aucune impression).' });
});

// POST /api/entrees/:id/photos — upload photo bon de livraison / facture
router.post('/:id/photos', authenticate, upload.single('photo'), (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });
  if (!req.file) return res.status(400).json({ error: 'Photo requise.' });

  const type = req.body.type || 'autre';
  if (!['bl', 'facture', 'autre'].includes(type)) {
    return res.status(400).json({ error: 'Type de photo invalide (bl, facture ou autre).' });
  }

  const photoPath = '/uploads/' + req.file.filename;
  const result = db.prepare(`
    INSERT INTO fiche_entree_photos (fiche_id, fichier_path, type) VALUES (?, ?, ?)
  `).run(req.params.id, photoPath, type);

  const photo = db.prepare('SELECT * FROM fiche_entree_photos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ photo });
});

// DELETE /api/entrees/:id (admin seulement)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });

  const lignes = db.prepare('SELECT * FROM fiche_entree_articles WHERE fiche_id = ?').all(req.params.id);

  for (const l of lignes) {
    const article = db.prepare('SELECT stock_actuel FROM articles WHERE id = ?').get(l.article_id);
    if (article && article.stock_actuel < l.quantite) {
      return res.status(400).json({
        error: 'Suppression impossible : stock article #' + l.article_id + ' (' + article.stock_actuel + ') inferieur a la quantite de l entree (' + l.quantite + '). Des sorties ont eu lieu.'
      });
    }
  }

  const transaction = db.transaction(() => {
    for (const l of lignes) {
      db.prepare('UPDATE articles SET stock_actuel = stock_actuel - ?, updated_at = datetime(\'now\') WHERE id = ?').run(l.quantite, l.article_id);
    }
    db.prepare("DELETE FROM series_numeros WHERE source_type = 'entree' AND source_id = ?").run(req.params.id);
    db.prepare('DELETE FROM mouvements WHERE entree_id = ?').run(req.params.id);
    db.prepare('DELETE FROM fiches_entree WHERE id = ?').run(req.params.id);
  });
  transaction();
  res.json({ message: 'Entree supprimee (stock ajuste).' });
});

module.exports = router;
```

- [ ] **Step 3: Monter la route dans `server.js`**

Après `app.use('/api/retours', require('./routes/retours'));` ajouter :

```js
app.use('/api/entrees', require('./routes/entrees'));
```

> La route `/api/series` est montée en Task 3 (fichier `routes/series.js` créé à ce moment).

- [ ] **Step 4: Vérifier**

Démarrer le serveur puis tester (le script ci-dessous crée une entrée, vérifie le stock et l'absence de PDF) :

```bash
cd /Users/macbookair/Desktop/Nizar && node server.js > /tmp/nizar.log 2>&1 &
sleep 2
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
# Trouver un article numerote existant (ou un article quelconque)
ART=$(curl -s "http://localhost:3000/api/articles" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).articles.find(x=>x.type_article==='numerote')||JSON.parse(s).articles[0];console.log(a.id)})")
curl -s http://localhost:3000/api/entrees -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"fournisseur_id\":null,\"numero_bl\":\"BL-TEST-01\",\"numero_facture\":\"FAC-TEST-01\",\"notes\":\"test\",\"articles\":[{\"article_id\":$ART,\"quantite\":5,\"numero_debut\":\"99901\",\"numero_fin\":\"99950\"}]}" | node -e "process.stdin.on('data',d=>console.log('CREATION:',JSON.parse(d).message||JSON.parse(d).error))"
curl -s "http://localhost:3000/api/entrees" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('NB ENTREES:',r.fiches.length,'| fichier_path absent:',!r.fiches[0].hasOwnProperty('fichier_path'))})"
kill %1 2>/dev/null
```
Expected: `CREATION: Entree enregistree (aucune impression).` puis `NB ENTREES: 1 | fichier_path absent: true`.

- [ ] **Step 5: Commit**

```bash
git add services/series.js routes/entrees.js server.js
git commit -m "feat: routes entrees fournisseur (enregistrement, photos, suppression, series)"
```

---

## Task 3: Fiches envoi — suivi des séries et statut « OK »

**Files:**
- Create: `routes/series.js`
- Modify: `routes/fiches_reception.js`
- Modify: `routes/dashboard.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `checkOverlap`/`recordSerie` (services/series.js, Task 2).
- Produces: `GET /api/series/:article_id` ; `PATCH /api/fiches/:id/statut` accepte `'signee'` ; `POST /api/fiches` enregistre les séries de sortie ; dashboard expose `entreesRecentes` et `kpi.entreesJour`.

- [ ] **Step 1: Créer `routes/series.js`**

```js
// routes/series.js — Historique des plages de numeros de souche d'un article
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/series/:article_id
router.get('/:article_id', authenticate, (req, res) => {
  const db = req.db;
  const series = db.prepare(`
    SELECT s.*, a.nom as article_nom, a.unite
    FROM series_numeros s
    LEFT JOIN articles a ON s.article_id = a.id
    WHERE s.article_id = ?
    ORDER BY CAST(s.numero_debut AS INTEGER) ASC
  `).all(req.params.article_id);
  res.json({ series });
});

module.exports = router;
```

- [ ] **Step 2: Monter `/api/series` dans `server.js`**

Ajouter après la ligne `/api/entrees` (si non déjà présente) :

```js
app.use('/api/series', require('./routes/series'));
```

- [ ] **Step 3: Enregistrer les séries de sortie dans `POST /api/fiches`**

Dans `routes/fiches_reception.js`, en tête de fichier, après `const { generateFichePDF } = require('../services/pdf');` ajouter :

```js
const { checkOverlap, recordSerie } = require('../services/series');
```

Dans la transaction, à l'intérieur de la boucle `for (const art of articles)`, après le contrôle `if (article.stock_actuel < art.quantite) { throw ... }`, ajouter :

```js
      if (article.type_article === 'numerote') {
        const overlap = checkOverlap(db, art.article_id, art.numero_debut, art.numero_fin, 'sortie');
        if (overlap) throw new Error('Chevauchement : plage ' + art.numero_debut + '-' + art.numero_fin + ' deja envoyee (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
        recordSerie(db, art.article_id, art.numero_debut, art.numero_fin, art.quantite, 'sortie', ficheId);
      }
```

> `ficheId` est déjà une variable du scope de la transaction (affectée avant la boucle).

- [ ] **Step 4: Étendre `PATCH /api/fiches/:id/statut`**

Remplacer le contrôle existant :

```js
  if (!['envoyee', 'archivee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide (envoyee ou archivee).' });
  }
```

par :

```js
  if (!['envoyee', 'signee', 'archivee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide (envoyee, signee ou archivee).' });
  }
```

- [ ] **Step 5: Enrichir `routes/dashboard.js`**

Après `const commandesEnCours = ...` ajouter :

```js
  const entreesJour = db.prepare(
    "SELECT COUNT(*) as count FROM fiches_entree WHERE date_entree >= date('now')"
  ).get().count;

  const entreesRecentes = db.prepare(`
    SELECT fe.id, fe.reference, fe.date_entree, fe.numero_bl, fe.numero_facture, f.nom as fournisseur_nom
    FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    ORDER BY fe.id DESC LIMIT 5
  `).all();
```

Dans l'objet retourné `res.json({ ... })`, remplacer `kpi: { totalArticles, alertesStock, mouvementsJour, commandesEnCours },` par :

```js
    kpi: { totalArticles, alertesStock, mouvementsJour, commandesEnCours, entreesJour },
    entreesRecentes,
```

- [ ] **Step 6: Vérifier**

```bash
cd /Users/macbookair/Desktop/Nizar && node server.js > /tmp/nizar.log 2>&1 &
sleep 2
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
# Créer un envoi puis le marquer OK (signee)
LOC=$(curl -s "http://localhost:3000/api/localites" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).localites[0].id))")
ART=$(curl -s "http://localhost:3000/api/articles" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).articles[0].id))")
FICHE=$(curl -s http://localhost:3000/api/fiches -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"localite_id\":$LOC,\"articles\":[{\"article_id\":$ART,\"quantite\":1}]}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).fiche.id))")
echo "FICHE=$FICHE"
curl -s http://localhost:3000/api/fiches/$FICHE/statut -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"statut":"signee"}' | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('STATUT:',r.fiche.statut, '| message:', r.message)})"
curl -s "http://localhost:3000/api/dashboard" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('kpi.entreesJour:',r.kpi.entreesJour,'| entreesRecentes:',r.entreesRecentes.length)})"
curl -s "http://localhost:3000/api/series/$ART" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('SERIES article:',JSON.parse(s).series.length))"
kill %1 2>/dev/null
```
Expected : `STATUT: signee | message: Statut mis a jour : signee`, `kpi.entreesJour` numérique, `entreesRecentes` ≥ 0, `SERIES article` ≥ 0 (0 si l'article testé n'est pas numéroté).

- [ ] **Step 7: Commit**

```bash
git add routes/series.js routes/fiches_reception.js routes/dashboard.js server.js
git commit -m "feat: statut signee (OK retour), enregistrement des series de sortie, dashboard entrees"
```

---

## Task 4: API client + navigation + chargement du script

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/app.js`
- Modify: `public/index.html`

**Interfaces:**
- Consumes: routes API des Tasks 2–3.
- Produces: `API.getEntrees(params)`, `API.getEntree(id)`, `API.createEntree(data)`, `API.deleteEntree(id)`, `API.uploadEntreePhoto(id, file, type)`, `API.getSeriesArticle(article_id)`. Page `entrees` enregistrée dans le routeur (`Entrees`).

- [ ] **Step 1: Ajouter les méthodes dans `public/js/api.js`**

Après le bloc « Retours de carnets » et avant « Import Excel », ajouter :

```js
  // Entrees fournisseur
  async getEntrees(params) {
    var qs = new URLSearchParams(params).toString();
    return this.fetch('/api/entrees' + (qs ? '?' + qs : ''));
  },

  async getEntree(id) {
    return this.fetch('/api/entrees/' + id);
  },

  async createEntree(data) {
    return this.fetch('/api/entrees', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async deleteEntree(id) {
    return this.fetch('/api/entrees/' + id, {
      method: 'DELETE'
    });
  },

  async uploadEntreePhoto(id, file, type) {
    var token = this.getToken();
    var formData = new FormData();
    formData.append('photo', file);
    formData.append('type', type);
    var res = await fetch('/api/entrees/' + id + '/photos', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  },

  async getSeriesArticle(article_id) {
    return this.fetch('/api/series/' + article_id);
  }
```

- [ ] **Step 2: Ajouter la page `entrees` dans `public/js/app.js`**

Dans `ALL_ITEMS`, après l'élément `fiches` (ligne ~12), ajouter :

```js
    { id: 'entrees', label: 'Entrees', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' },
```

Dans `BOTTOM_ITEMS`, remplacer :

```js
  var BOTTOM_ITEMS = ['dashboard', 'articles', 'fiches', 'mouvements'];
```

par :

```js
  var BOTTOM_ITEMS = ['dashboard', 'articles', 'fiches', 'entrees', 'mouvements'];
```

Dans `buildNav()`, `var mainIds = ['dashboard', 'articles', 'fiches', 'mouvements'];` → remplacer par :

```js
    var mainIds = ['dashboard', 'articles', 'fiches', 'entrees', 'mouvements'];
```

Dans `renderPage()`, l'objet `pages` : ajouter après `fiches: ...` la ligne :

```js
      entrees: typeof Entrees !== 'undefined' ? Entrees : null,
```

- [ ] **Step 3: Charger `entrees.js` dans `public/index.html`**

Après `<script src="/js/fiches.js"></script>` ajouter :

```html
  <script src="/js/entrees.js"></script>
```

- [ ] **Step 4: Vérifier la cohérence syntaxique**

Run: `node --check public/js/api.js && node --check public/js/app.js`
Expected: aucune sortie d'erreur (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/api.js public/js/app.js public/index.html
git commit -m "feat: client API entrees, page de navigation et chargement du script"
```

---

## Task 5: Page frontend « Entrées » (`public/js/entrees.js`)

**Files:**
- Create: `public/js/entrees.js`

**Interfaces:**
- Consumes: `API.getEntrees`, `API.getEntree`, `API.createEntree`, `API.deleteEntree`, `API.uploadEntreePhoto`, `API.getArticles`, `API.getFournisseurs`, `UI.*` (modal, toast, confirm, escapeHtml, formatDate, formatNumber, renderSkeleton, renderEmptyState).
- Produces: module global `Entrees` avec `render(container)` — consommé par `renderPage` (Task 4).

- [ ] **Step 1: Créer `public/js/entrees.js`**

```js
// public/js/entrees.js — Entrees fournisseur (enregistrement sans impression)
var Entrees = {
  _lignes: [],
  _articleOptions: '',

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Entrees fournisseur</h3>' +
      '<button class="btn btn-primary" id="btn-new-entree">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouvelle entree</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="entree-statut"><option value="">Tous statuts</option><option value="validee">Validee</option><option value="archivee">Archivee</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-entrees-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Les articles arrivent avec le bon de livraison et la facture du fournisseur — aucune impression depuis l app. Les photos de ces documents peuvent etre archivees.</p>' +
      '<div id="entrees-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-entree').addEventListener('click', function() { self._showForm(); });
    document.getElementById('entree-statut').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-entrees-refresh').addEventListener('click', function() { self._load(); });
  },

  _load: function() {
    var self = this;
    var params = {};
    var s = document.getElementById('entree-statut').value;
    if (s) params.statut = s;

    API.getEntrees(params).then(function(data) { self._renderTable(data.fiches); })
      .catch(function(err) {
        document.getElementById('entrees-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('entrees-table');
    if (!fiches || !fiches.length) { el.innerHTML = UI.renderEmptyState('Aucune entree', 'Enregistrer une entree', 'entrees'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Date</th><th>Fournisseur</th><th>N° BL</th><th>N° facture</th><th>Photos</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];
      var statutCls = f.statut === 'archivee' ? 'badge-neutral' : 'badge-success';
      html += '<tr>' +
        '<td><strong style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(f.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(f.date_entree) + '</td>' +
        '<td><strong>' + UI.escapeHtml(f.fournisseur_nom || '-') + '</strong></td>' +
        '<td>' + UI.escapeHtml(f.numero_bl || '-') + '</td>' +
        '<td>' + UI.escapeHtml(f.numero_facture || '-') + '</td>' +
        '<td>' + (f.nb_photos > 0 ? '<span class="badge badge-info">' + f.nb_photos + '</span>' : '<span class="text-muted">—</span>') + '</td>' +
        '<td><span class="badge ' + statutCls + '">' + (f.statut === 'archivee' ? 'Archivee' : 'Validee') + '</span></td>' +
        '<td class="actions">' +
        '<button class="btn btn-sm btn-info btn-view-entree" data-id="' + f.id + '">Details</button>';
      if (f.statut !== 'archivee') {
        html += '<button class="btn btn-sm btn-success btn-photo-entree" data-id="' + f.id + '">Photo BL/Facture</button>';
      }
      html += '<button class="btn btn-sm btn-danger btn-del-entree" data-id="' + f.id + '">Suppr.</button>' +
        '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    var btns = el.querySelectorAll('.btn-view-entree, .btn-photo-entree, .btn-del-entree');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (this.classList.contains('btn-view-entree')) self._viewEntree(id);
        else if (this.classList.contains('btn-photo-entree')) self._addPhoto(id);
        else if (this.classList.contains('btn-del-entree')) self._deleteEntree(id);
      });
    }
  },

  _showForm: function() {
    var self = this;
    Promise.all([API.getFournisseurs(), API.getArticles()]).then(function(results) {
      var fournisseurs = results[0].fournisseurs;
      var articles = results[1].articles;

      var fournOptions = '<option value="">Fournisseur (optionnel)</option>';
      for (var i = 0; i < fournisseurs.length; i++) {
        fournOptions += '<option value="' + fournisseurs[i].id + '">' + UI.escapeHtml(fournisseurs[i].nom) + '</option>';
      }

      var articleOptions = '';
      for (var j = 0; j < articles.length; j++) {
        var a = articles[j];
        articleOptions += '<option value="' + a.id + '" data-type="' + a.type_article + '">' + UI.escapeHtml(a.nom) + ' (stock: ' + a.stock_actuel + ' ' + UI.escapeHtml(a.unite) + ')' + (a.type_article === 'numerote' ? ' [NUMEROTE]' : '') + '</option>';
      }
      self._articleOptions = articleOptions;
      self._lignes = [{ article_id: '', quantite: 1, numero_debut: '', numero_fin: '' }];

      var body =
        '<div class="form-group"><label class="form-label">Fournisseur</label><select class="form-select" id="entree-fourn">' + fournOptions + '</select></div>' +
        '<div class="form-group"><label class="form-label">N° bon de livraison</label><input type="text" class="form-input" id="entree-bl" placeholder="Ex: BL-2026-001"></div>' +
        '<div class="form-group"><label class="form-label">N° facture</label><input type="text" class="form-input" id="entree-facture" placeholder="Ex: FAC-2026-001"></div>' +
        '<div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="entree-notes" rows="2" placeholder="Observations..."></textarea></div>' +
        '<div class="flex-between mb-sm"><strong>Articles</strong><button class="btn btn-sm btn-secondary" id="btn-add-line">+ Ajouter</button></div>' +
        '<div id="lignes-entree"></div>';

      UI.modal('Nouvelle entree (sans impression)', body, [
        { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
        { label: 'Enregistrer', cls: 'btn-primary', callback: function(m) { self._saveEntree(m); } }
      ]);

      document.getElementById('btn-add-line').addEventListener('click', function() {
        self._lignes.push({ article_id: '', quantite: 1, numero_debut: '', numero_fin: '' });
        self._refreshLignes();
      });
      self._refreshLignes();
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _refreshLignes: function() {
    var lc = document.getElementById('lignes-entree');
    if (!lc) return;
    var h = '';
    for (var k = 0; k < this._lignes.length; k++) {
      var l = this._lignes[k];
      h += '<div class="commande-ligne" style="grid-template-columns:2fr 80px auto auto 32px;gap:4px;align-items:end">' +
        '<select class="form-select art-entree" data-idx="' + k + '" style="min-height:40px;font-size:0.85rem"><option value="">Article</option>' + this._articleOptions + '</select>' +
        '<input type="number" class="form-input qte-entree" data-idx="' + k + '" value="' + (l.quantite || 1) + '" min="1" placeholder="Qte" style="min-height:40px">' +
        '<input type="text" class="form-input num-debut" data-idx="' + k + '" value="' + (l.numero_debut || '') + '" placeholder="N° debut" style="min-height:40px">' +
        '<input type="text" class="form-input num-fin" data-idx="' + k + '" value="' + (l.numero_fin || '') + '" placeholder="N° fin" style="min-height:40px">' +
        '<button class="btn btn-sm btn-danger btn-rm-line" data-idx="' + k + '" style="min-width:32px;min-height:40px">&times;</button>' +
        '</div>';
    }
    lc.innerHTML = h;
    this._bindLignes(lc);
  },

  _bindLignes: function(container) {
    var self = this;
    container.querySelectorAll('.art-entree').forEach(function(el) {
      el.addEventListener('change', function() { self._lignes[parseInt(this.dataset.idx)].article_id = this.value; });
    });
    container.querySelectorAll('.qte-entree').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].quantite = parseInt(this.value) || 1; });
    });
    container.querySelectorAll('.num-debut').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].numero_debut = this.value; });
    });
    container.querySelectorAll('.num-fin').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].numero_fin = this.value; });
    });
    container.querySelectorAll('.btn-rm-line').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(this.dataset.idx);
        if (self._lignes.length <= 1) { UI.toast('Il faut au moins un article.', 'warning'); return; }
        self._lignes.splice(idx, 1);
        self._refreshLignes();
      });
    });
  },

  _saveEntree: function(modal) {
    var fournisseurId = document.getElementById('entree-fourn').value || null;
    var numero_bl = document.getElementById('entree-bl').value.trim() || null;
    var numero_facture = document.getElementById('entree-facture').value.trim() || null;
    var notes = document.getElementById('entree-notes').value.trim() || null;

    var arts = [];
    for (var i = 0; i < this._lignes.length; i++) {
      var l = this._lignes[i];
      if (!l.article_id) { UI.toast('Tous les articles sont requis.', 'error'); return; }
      arts.push({ article_id: parseInt(l.article_id), quantite: l.quantite || 1, numero_debut: l.numero_debut || null, numero_fin: l.numero_fin || null });
    }

    var self = this;
    API.createEntree({ fournisseur_id: fournisseurId, numero_bl: numero_bl, numero_facture: numero_facture, notes: notes, articles: arts })
      .then(function(data) {
        UI.toast(data.message || 'Entree enregistree.', 'success');
        modal.close();
        self._load();
        setTimeout(function() {
          UI.confirm('Voulez-vous prendre en photo le bon de livraison et/ou la facture pour les archiver ?')
            .then(function(ok) { if (ok) self._viewEntree(data.fiche.id); });
        }, 400);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _viewEntree: function(id) {
    var self = this;
    API.getEntree(id).then(function(data) {
      var f = data.fiche, lignes = data.lignes, photos = data.photos;

      var html = '<div style="font-size:0.9rem">' +
        '<div class="flex-between mb-md"><div><strong>Ref:</strong> ' + UI.escapeHtml(f.reference) + '</div><div><span class="badge ' + (f.statut === 'archivee' ? 'badge-neutral' : 'badge-success') + '">' + (f.statut === 'archivee' ? 'Archivee' : 'Validee') + '</span></div></div>' +
        '<div class="flex-between mb-md"><div><strong>Fournisseur:</strong> ' + UI.escapeHtml(f.fournisseur_nom || '-') + '</div><div><strong>Date:</strong> ' + UI.formatDate(f.date_entree) + '</div></div>' +
        '<div class="flex-between mb-md"><div><strong>N° BL:</strong> ' + UI.escapeHtml(f.numero_bl || '-') + '</div><div><strong>N° facture:</strong> ' + UI.escapeHtml(f.numero_facture || '-') + '</div></div>';

      if (lignes.length) {
        html += '<div class="table-wrapper"><table><thead><tr><th>Article</th><th>Qté</th><th>N° debut</th><th>N° fin</th></tr></thead><tbody>';
        for (var i = 0; i < lignes.length; i++) {
          html += '<tr><td>' + UI.escapeHtml(lignes[i].article_nom || '-') + '</td><td>' + lignes[i].quantite + '</td><td>' + (lignes[i].numero_debut || '-') + '</td><td>' + (lignes[i].numero_fin || '-') + '</td></tr>';
        }
        html += '</tbody></table></div>';
      }

      html += '<div class="mt-md"><div class="flex-between"><strong>Photos archivees</strong><button class="btn btn-sm btn-secondary" id="btn-add-photo-detail">+ Photo</button></div>' +
        '<div id="photos-gallery" class="flex-wrap" style="display:flex;gap:8px;margin-top:0.5rem">';
      if (photos.length) {
        for (var p = 0; p < photos.length; p++) {
          var label = photos[p].type === 'bl' ? 'Bon de livraison' : (photos[p].type === 'facture' ? 'Facture' : 'Autre');
          html += '<div style="width:120px;text-align:center">' +
            '<a href="' + photos[p].fichier_path + '" target="_blank"><img src="' + photos[p].fichier_path + '" style="width:100%;height:90px;object-fit:cover;border:1px solid var(--color-border);border-radius:8px"></a>' +
            '<span class="text-sm">' + label + '</span></div>';
        }
      } else {
        html += '<p class="text-muted text-sm">Aucune photo.</p>';
      }
      html += '</div></div></div>';

      var actions = [{ label: 'Fermer', cls: 'btn-secondary', callback: function(m) { m.close(); } }];
      UI.modal('Entree ' + UI.escapeHtml(f.reference), html, actions);

      var addBtn = document.getElementById('btn-add-photo-detail');
      if (addBtn) addBtn.addEventListener('click', function() { self._addPhoto(f.id); });
    }).catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _addPhoto: function(id) {
    var self = this;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.capture = 'environment';

    input.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { UI.toast('Fichier trop volumineux (max 10 Mo).', 'error'); return; }
      UI.confirm('C\'est le bon de livraison ? (Oui = BL, Non = Facture/Autre)').then(function(isBl) {
        var type = isBl ? 'bl' : 'facture';
        UI.toast('Enregistrement de la photo...', 'info');
        API.uploadEntreePhoto(id, file, type).then(function(data) {
          if (data.error) { UI.toast(data.error, 'error'); return; }
          UI.toast('Photo archivee.', 'success');
          self._load();
        }).catch(function(err) { UI.toast(err.message, 'error'); });
      });
    });
    input.click();
  },

  _deleteEntree: function(id) {
    var self = this;
    UI.confirm('Supprimer cette entree ? Le stock sera ajuste (refuse si des sorties ont deja eu lieu).').then(function(ok) {
      if (!ok) return;
      API.deleteEntree(id).then(function() { UI.toast('Entree supprimee.', 'success'); self._load(); })
        .catch(function(err) { UI.toast(err.message, 'error'); });
    });
  }
};
```

- [ ] **Step 2: Vérifier la syntaxe**

Run: `node --check public/js/entrees.js`
Expected: aucune sortie (exit 0).

- [ ] **Step 3: Vérification manuelle (frontend)**

Ouvrir `http://localhost:3000`, se connecter (admin/admin123), aller sur l'onglet « Entrées » :
- La liste est vide ou affiche les entrées créées en Task 2.
- « Nouvelle entree » ouvre le formulaire ; enregistrer une entrée → toast de confirmation, **aucun PDF** téléchargé.
- « Details » affiche les lignes + le bouton « + Photo » → prendre/uploader une photo → elle apparaît dans la galerie.

- [ ] **Step 4: Commit**

```bash
git add public/js/entrees.js
git commit -m "feat: page entrees fournisseur (formulaire, details, photos BL/facture)"
```

---

## Task 6: Page Fiches — bouton « OK — Retour reçu »

**Files:**
- Modify: `public/js/fiches.js`

**Interfaces:**
- Consumes: `API.changeStatutFiche(id, statut)` (existant, accepte désormais `'signee'`).
- Produces: bouton « OK — Retour reçu » sur les fiches `envoyee`, badge « OK » pour `signee`, états de statut mis à jour.

- [ ] **Step 1: Mapper les libellés et badges de statut**

Dans `_renderTable`, remplacer :

```js
      var statutLabel = f.statut === 'envoyee' ? 'Sortie validee' : 'Archivee';
      var statutCls = f.statut === 'envoyee' ? 'badge-info' : 'badge-neutral';
```

par :

```js
      var statutLabel = f.statut === 'envoyee' ? 'Sortie validee' : (f.statut === 'signee' ? 'OK — Retour recu' : 'Archivee');
      var statutCls = f.statut === 'envoyee' ? 'badge-info' : (f.statut === 'signee' ? 'badge-success' : 'badge-neutral');
```

- [ ] **Step 2: Ajouter le bouton « OK » dans le tableau**

Dans `_renderTable`, après le bloc existant `if (f.statut === 'envoyee') { html += '<button ... btn-upload-scan ...>Scanner</button>'; }`, ajouter :

```js
      if (f.statut === 'envoyee') {
        html += '<button class="btn btn-sm btn-success btn-ok-retour" data-id="' + f.id + '">OK — Retour</button>';
      }
```

- [ ] **Step 3: Gérer le clic « OK »**

Dans le tableau, remplacer la liste de classes :

```js
    ['btn-view-fiche', 'btn-dl-pdf', 'btn-upload-scan'].forEach(function(cls) {
```

par :

```js
    ['btn-view-fiche', 'btn-dl-pdf', 'btn-upload-scan', 'btn-ok-retour'].forEach(function(cls) {
```

et dans le handler, après `else if (this.classList.contains('btn-upload-scan')) self._uploadScan(id);` ajouter :

```js
          else if (this.classList.contains('btn-ok-retour')) self._okRetour(id);
```

- [ ] **Step 4: Ajouter la méthode `_okRetour`**

Après la méthode `_archiveFiche`, ajouter :

```js
  _okRetour: function(id) {
    var self = this;
    UI.confirm('Marquer « OK » (retour signe recu) sur cette fiche ? Le document signe est renvoye par l agence.').then(function(ok) {
      if (!ok) return;
      API.changeStatutFiche(id, 'signee').then(function() {
        UI.toast('Retour valide — fiche marquee OK. Le PDF reste imprimable a tout moment.', 'success');
        self._load();
      }).catch(function(err) { UI.toast(err.message, 'error'); });
    });
  }
```

- [ ] **Step 5: Mettre à jour la vue détail**

Dans `_viewFiche`, remplacer :

```js
        '<div class="flex-between mb-md"><div><strong>Ref:</strong> ' + UI.escapeHtml(f.reference) + '</div><div><span class="badge ' + (f.statut === 'envoyee' ? 'badge-info' : 'badge-neutral') + '">' + (f.statut === 'envoyee' ? 'Sortie validee' : 'Archivee') + '</span></div></div>' +
```

par :

```js
        '<div class="flex-between mb-md"><div><strong>Ref:</strong> ' + UI.escapeHtml(f.reference) + '</div><div><span class="badge ' + (f.statut === 'envoyee' ? 'badge-info' : (f.statut === 'signee' ? 'badge-success' : 'badge-neutral')) + '">' + (f.statut === 'envoyee' ? 'Sortie validee' : (f.statut === 'signee' ? 'OK — Retour recu' : 'Archivee')) + '</span></div></div>' +
```

et, dans le bloc des actions de `_viewFiche`, après `if (f.statut === 'envoyee') { actions.unshift({ label: 'Archiver', ... }); }`, ajouter :

```js
      if (f.statut === 'envoyee') {
        actions.unshift({ label: 'OK — Retour recu', cls: 'btn-success', callback: function(m) { m.close(); self._okRetour(id); } });
      }
```

- [ ] **Step 6: Vérifier la syntaxe**

Run: `node --check public/js/fiches.js`
Expected: aucune sortie (exit 0).

- [ ] **Step 7: Commit**

```bash
git add public/js/fiches.js
git commit -m "feat: bouton OK retour (statut signee) sur les fiches de reception"
```

---

## Task 7: Tableau de bord — dernières entrées

**Files:**
- Modify: `public/js/dashboard.js`

**Interfaces:**
- Consumes: `data.entreesRecentes` et `data.kpi.entreesJour` (routes/dashboard.js, Task 3).
- Produces: carte « Dernières entrées fournisseur ».

- [ ] **Step 1: Ajouter la carte dans `render`**

Remplacer :

```js
    container.innerHTML = '<div class="kpi-grid" id="kpi-grid">' + UI.renderSkeleton(4) + '</div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Derniers mouvements</h3></div><div id="recent-mvts">' + UI.renderSkeleton(5) + '</div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Alertes stock bas</h3></div><div id="top-alertes">' + UI.renderSkeleton(3) + '</div></div>';
```

par :

```js
    container.innerHTML = '<div class="kpi-grid" id="kpi-grid">' + UI.renderSkeleton(4) + '</div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Derniers mouvements</h3></div><div id="recent-mvts">' + UI.renderSkeleton(5) + '</div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Dernieres entrees fournisseur</h3></div><div id="recent-entrees">' + UI.renderSkeleton(4) + '</div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Alertes stock bas</h3></div><div id="top-alertes">' + UI.renderSkeleton(3) + '</div></div>';
```

- [ ] **Step 2: Appeler le rendu**

Dans le `.then(function(data) { ... })`, après `Dashboard._renderAlertes(data.topAlertes);` ajouter :

```js
        Dashboard._renderEntrees(data.entreesRecentes);
```

- [ ] **Step 3: Ajouter la méthode `_renderEntrees`**

Après `_renderMouvements`, ajouter :

```js
  _renderEntrees: function(entrees) {
    var el = document.getElementById('recent-entrees');
    if (!el) return;
    if (!entrees || !entrees.length) {
      el.innerHTML = UI.renderEmptyState('Aucune entree fournisseur recente');
      return;
    }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Date</th><th>Fournisseur</th><th>N° BL</th><th>N° facture</th></tr></thead><tbody>';

    for (var i = 0; i < entrees.length; i++) {
      var e = entrees[i];
      html += '<tr>' +
        '<td><strong>' + UI.escapeHtml(e.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(e.date_entree) + '</td>' +
        '<td>' + UI.escapeHtml(e.fournisseur_nom || '-') + '</td>' +
        '<td>' + UI.escapeHtml(e.numero_bl || '-') + '</td>' +
        '<td>' + UI.escapeHtml(e.numero_facture || '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }
```

- [ ] **Step 4: Vérifier la syntaxe**

Run: `node --check public/js/dashboard.js`
Expected: aucune sortie (exit 0).

- [ ] **Step 5: Commit**

```bash
git add public/js/dashboard.js
git commit -m "feat: carte dernieres entrees fournisseur au tableau de bord"
```

---

## Task 8: Recette de bout en bout

**Files:**
- Aucun fichier de code (vérification).

- [ ] **Step 1: Vérifier le démarrage du serveur**

```bash
cd /Users/macbookair/Desktop/Nizar && node server.js > /tmp/nizar.log 2>&1 &
sleep 2
cat /tmp/nizar.log
curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | head -c 120
kill %1 2>/dev/null
```
Expected : le serveur démarre sans stack trace, le login renvoie un JSON avec `token`.

- [ ] **Step 2: Vérifier les vérifications syntaxiques de tous les fichiers JS**

```bash
cd /Users/macbookair/Desktop/Nizar && for f in services/series.js routes/entrees.js routes/series.js routes/fiches_reception.js routes/dashboard.js public/js/api.js public/js/entrees.js public/js/fiches.js public/js/dashboard.js public/js/app.js; do node --check "$f" || echo "ERREUR: $f"; done; echo "OK synthese"
```
Expected : « OK synthese » sans erreur.

- [ ] **Step 3: Vérifier le flux entrée (stock +, pas de PDF, chevauchement refusé)**

```bash
cd /Users/macbookair/Desktop/Nizar && node server.js > /tmp/nizar.log 2>&1 &
sleep 2
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
ART=$(curl -s "http://localhost:3000/api/articles" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).articles.find(x=>x.type_article==='numerote')||JSON.parse(s).articles[0];console.log(a.id)})")
# Avant
BEFORE=$(curl -s "http://localhost:3000/api/articles/$ART" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).article.stock_actuel))")
# Entree (deux fois pour tester le chevauchement)
curl -s http://localhost:3000/api/entrees -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"numero_bl\":\"BL-R1\",\"articles\":[{\"article_id\":$ART,\"quantite\":2,\"numero_debut\":\"88801\",\"numero_fin\":\"88850\"}]}" | node -e "process.stdin.on('data',d=>console.log('R1:',JSON.parse(d).message||JSON.parse(d).error))"
curl -s http://localhost:3000/api/entrees -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"numero_bl\":\"BL-R2\",\"articles\":[{\"article_id\":$ART,\"quantite\":1,\"numero_debut\":\"88830\",\"numero_fin\":\"88850\"}]}" | node -e "process.stdin.on('data',d=>console.log('R2 (chevauchement attendu):',JSON.parse(d).error))"
AFTER=$(curl -s "http://localhost:3000/api/articles/$ART" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).article.stock_actuel))")
echo "Stock avant=$BEFORE apres=$AFTER (attendu: +2)"
kill %1 2>/dev/null
```
Expected : `R1: Entree enregistree (aucune impression).`, `R2 (chevauchement attendu):` un message contenant « Chevauchement », `Stock avant=$BEFORE apres=$AFTER` avec après = avant + 2.

- [ ] **Step 4: Vérifier le flux fiche (sortie + OK retour + ré-impression PDF)**

```bash
cd /Users/macbookair/Desktop/Nizar && node server.js > /tmp/nizar.log 2>&1 &
sleep 2
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
LOC=$(curl -s "http://localhost:3000/api/localites" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).localites[0].id))")
ART=$(curl -s "http://localhost:3000/api/articles" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).articles[0].id))")
FICHE=$(curl -s http://localhost:3000/api/fiches -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"localite_id\":$LOC,\"articles\":[{\"article_id\":$ART,\"quantite\":1}]}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).fiche.id))")
echo "PDF genere (fichier_path):"; curl -s "http://localhost:3000/api/fiches/$FICHE" -H "Authorization: Bearer $TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('  path:',r.fiche.fichier_path)})"
curl -s "http://localhost:3000/api/fiches/$FICHE/statut" -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"statut":"signee"}' | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('OK retour -> statut:',r.fiche.statut)})"
HTTP=$(curl -s -o /tmp/fiche.pdf -w "%{http_code}" "http://localhost:3000/api/fiches/$FICHE/pdf" -H "Authorization: Bearer $TOKEN")
echo "Re-impression PDF apres archivage -> HTTP $HTTP (taille: $(wc -c < /tmp/fiche.pdf) octets)"
kill %1 2>/dev/null
```
Expected : `PDF genere (fichier_path):` une valeur non nulle, `OK retour -> statut: signee`, `Re-impression PDF apres archivage -> HTTP 200` avec taille > 0.

- [ ] **Step 5: Nettoyage des données de test et commit final**

Supprimer les entrées de test créées (via l'UI ou directement, elles sont sans impact sur les données métier). Puis :

```bash
cd /Users/macbookair/Desktop/Nizar && git status --short
```
Vérifier qu'il ne reste que des fichiers intentionnels. Puis commit final si des fichiers non commités subsistent :

```bash
git add -A && git commit -m "chore: finalisation recette V2 entrees et envois" || echo "rien a commiter"
```
