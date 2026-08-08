# Retours client : fiche de besoin, bon de livraison, garde-fou stock, grand livre, anomalies import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 5 fixes/features from the client's post-test feedback: fiche de besoin module, bon de livraison PDF generation, stock guard on sorties, a chronological ledger replacing the "Inventaire" page, and an admin tool to fix import anomalies.

**Architecture:** Express + better-sqlite3 backend (route-per-resource, same pattern as existing `entrees`/`retours`/`fiches_reception`), vanilla-JS SPA frontend (one object-literal module per page, wired into `app.js`'s page map and nav arrays). The bon de livraison PDF is generated **from scratch with pdfkit** (same technique as `generateStockPDF` in `services/pdf.js`), not by overlaying the existing `bon-de-reception.pdf` model — overlaying a foreign, unfamiliar PDF's baked-in title/labels with pixel-perfect precision needs a slow visual-iteration loop this deadline doesn't allow for; a from-scratch pdfkit document reuses the same logo/colors/table styling and is fully controllable in one pass.

**Tech Stack:** Node.js, Express, better-sqlite3, pdfkit, exceljs (existing dependency, already used for report exports — **not** `xlsx`, which is reserved for reading `.xlsx` imports), multer (existing `services/uploads.js`), vanilla JS frontend (`UI`/`API` globals already in the codebase).

## Global Constraints

- No automated test framework exists in this repo (no jest/mocha, no `tests/` folder — confirmed via `package.json`). Every task's verification step therefore uses **manual smoke tests**: either a standalone `node -e` script exercising a pure function/DB call directly, or a temporary server instance on port `3099` against a **disposable SQLite database** (never the real `database/nizar.db`, except in Task 1 where applying the schema migration to the real db *is* the deliverable — that step is additive/idempotent and read-verified only, no test rows written to it).
- **Never let a verification server touch the real cloud backup.** `.env` at the repo root defines `GH_BACKUP_REPO`/`GH_BACKUP_TOKEN`, which makes `server.js` restore-from and push-to a real GitHub backup repo on every boot/interval/shutdown. Every verification server start in this plan MUST override these to empty (`GH_BACKUP_REPO= GH_BACKUP_TOKEN=`) so `services/cloud_backup.js` stays inactive. R2 backup is already inactive by default (no `R2_*` vars in `.env`).
- Disposable test fixtures live at `/tmp/nizar-test.db` and `/tmp/nizar-test-uploads/` — recreated fresh at the start of each task's verification (`rm -f` / `rm -rf` then re-init), removed after. Never reuse test data across tasks.
- A fresh test db seeds `admin`/`admin123` (see `database/init.js` seed block) — use these credentials for verification logins. This is **not** the same as the real local `database/nizar.db`, whose admin account was renamed (`Moustapha`/`admin123`, per project history) — do not assume `admin`/`admin123` works against the real db.
- Follow existing code conventions exactly: French comments only where they explain non-obvious *why*, `db.transaction(() => {...})` for multi-statement writes, `logAudit(db, req.user.id, req.user.username, 'ACTION', 'details')` on every create/update/delete, routes return `{ error: '...' }` with 400 for business-rule failures and let SQLite errors bubble to `server.js`'s global handler.
- Server registration: every new route file is mounted in `server.js` via `app.use('/api/<path>', require('./routes/<file>'));`, inserted near the other fiches-related mounts (after `app.use('/api/entrees', ...)`).

---

## File Structure

| File | Responsibility |
|---|---|
| `database/init.js` | *Modify* — add `fiches_besoin`/`fiche_besoin_articles` tables, `fiches_entree.fichier_path`/`numero_fiche_besoin` columns. |
| `routes/fiches_besoin.js` | *Create* — CRUD + statut pipeline + scan upload for fiches de besoin. |
| `routes/entrees.js` | *Modify* — `numero_fiche_besoin` on create, `POST /:id/bon-livraison`, `GET /:id/pdf`, updated `hasBL` gate in `/:id/valider`. |
| `routes/fiches_reception.js` | *Modify* — stock guard in `POST /`. |
| `routes/inventaires.js` | *Modify* — `GET /journal`, `GET /journal/export` (grand livre). |
| `routes/mouvements.js` | *Modify* — `GET /anomalies`, `PATCH /:id/numero`. |
| `services/pdf.js` | *Modify* — add `generateBonLivraisonPDF(fiche, lignes)`. |
| `scripts/import_v2.js` | *Modify* — harden `parseRange` regex (no functional re-run in this plan). |
| `server.js` | *Modify* — mount `routes/fiches_besoin.js`. |
| `public/js/api.js` | *Modify* — client methods for all of the above. |
| `public/js/fiches_besoin.js` | *Create* — Fiches de besoin page. |
| `public/js/entrees.js` | *Modify* — N° fiche de besoin field, "Générer le bon de livraison" action. |
| `public/js/grandlivre.js` | *Create* — grand livre page (replaces `InventaireStock` in nav). |
| `public/js/inventaire_stock.js` | *Delete* — fully superseded by `grandlivre.js`, no longer referenced. |
| `public/js/parametres.js` | *Modify* — admin-only "Anomalies d'import" card. |
| `public/js/app.js` | *Modify* — nav entries, `pages` map, `QUICK_ACTIONS` for fiches de besoin. |
| `public/index.html` | *Modify* — swap `inventaire_stock.js` script tag for `grandlivre.js`, add `fiches_besoin.js`. |

---

### Task 1: Schema migration — fiches_besoin, fiche_besoin_articles, fiches_entree columns

**Files:**
- Modify: `database/init.js:150-215` (new tables in the `db.exec` block), `database/init.js:224-234` (new `ensureColumn` calls)

**Interfaces:**
- Produces: tables `fiches_besoin(id, reference, date_creation, statut, notes, scan_path, user_id, created_at, updated_at)` and `fiche_besoin_articles(id, fiche_id, article_id, quantite, observation)`; columns `fiches_entree.fichier_path`, `fiches_entree.numero_fiche_besoin`.

- [ ] **Step 1: Add the two new tables to the schema block**

In `database/init.js`, insert immediately after the `fiche_entree_photos` table definition (which ends around line 180, right before `CREATE TABLE IF NOT EXISTS series_numeros`):

```sql
    CREATE TABLE IF NOT EXISTS fiches_besoin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      date_creation TEXT DEFAULT (datetime('now','localtime')),
      statut TEXT NOT NULL DEFAULT 'creee' CHECK(statut IN ('creee','transmise','revenue','archivee')),
      notes TEXT,
      scan_path TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS fiche_besoin_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiche_id INTEGER NOT NULL REFERENCES fiches_besoin(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      quantite INTEGER NOT NULL DEFAULT 1,
      observation TEXT
    );
```

- [ ] **Step 2: Add the two new columns via `ensureColumn`**

In `database/init.js`, right after the existing block of `ensureColumn` calls (the lines starting `ensureColumn(db, 'mouvements', 'entree_id', ...)` through `ensureColumn(db, 'fiche_reception_articles', 'unite', ...)`, just before the `fiches_reception` statut-migration block), add:

```js
  ensureColumn(db, 'fiches_entree', 'fichier_path', 'TEXT');
  ensureColumn(db, 'fiches_entree', 'numero_fiche_besoin', 'TEXT');
```

- [ ] **Step 3: Apply the migration to the real local database and verify**

Run:
```bash
node database/init.js
```
Expected: prints `Base de donnees initialisee avec succes (v2).` with no errors (idempotent — safe to run against the existing populated db, only adds tables/columns).

Verify the new schema landed:
```bash
node -e "
const db = require('better-sqlite3')('database/nizar.db');
console.log('fiches_besoin cols:', db.prepare(\"PRAGMA table_info(fiches_besoin)\").all().map(c => c.name));
console.log('fiche_besoin_articles cols:', db.prepare(\"PRAGMA table_info(fiche_besoin_articles)\").all().map(c => c.name));
console.log('fiches_entree cols:', db.prepare(\"PRAGMA table_info(fiches_entree)\").all().map(c => c.name));
db.close();
"
```
Expected: `fiches_besoin cols` includes `reference, statut, scan_path`; `fiche_besoin_articles cols` includes `fiche_id, article_id, quantite, observation`; `fiches_entree cols` includes `fichier_path, numero_fiche_besoin`.

- [ ] **Step 4: Run it a second time to confirm idempotency**

```bash
node database/init.js
```
Expected: same success message, no `SQLITE_ERROR: duplicate column` or `table already exists` errors (confirms `ensureColumn`/`IF NOT EXISTS` guards work).

- [ ] **Step 5: Commit**

```bash
git add database/init.js
git commit -m "feat: schema pour fiches de besoin et bon de livraison genere"
```

---

### Task 2: PDF generation — `generateBonLivraisonPDF`

**Files:**
- Modify: `services/pdf.js` (add function + export, near `generateFichePDF`)

**Interfaces:**
- Consumes: `fiche = { reference, fournisseur_nom, date_entree, numero_bl, numero_fiche_besoin }`, `lignes = [{ article_nom, quantite, numero_debut, numero_fin, unite }]` (same shape already produced by `entrees.js` route queries).
- Produces: `generateBonLivraisonPDF(fiche, lignes) → Promise<string>` resolving to `'/uploads/<filename>.pdf'`, mirroring `generateFichePDF`'s contract exactly (so `routes/entrees.js` can call it the same way).

- [ ] **Step 1: Add the function to `services/pdf.js`**

Insert after `generateFichePDF` (after its closing `}` around line 134), before the `uniteLabel` helper:

```js
/**
 * Genere le PDF « Bon de livraison » quand le fournisseur n'a pas transmis
 * de bon de livraison papier. Construit de zero avec pdfkit (meme charte
 * graphique — logo, teal, tableau noir/blanc — que generateStockPDF), plutot
 * que par overlay sur le modele bon-de-reception.pdf : evite de deviner des
 * coordonnees sur un document dont le contenu imprime (titre, libelles) est
 * fige dans une image/texte qu'on ne maitrise pas pixel pres.
 * @param {Object} fiche - { reference, fournisseur_nom, date_entree, numero_bl, numero_fiche_besoin }
 * @param {Array} lignes - [{ article_nom, quantite, numero_debut, numero_fin, unite }]
 * @returns {Promise<string>} chemin '/uploads/...' du PDF genere
 */
function generateBonLivraisonPDF(fiche, lignes) {
  return new Promise((resolve, reject) => {
    try {
      const filename = 'bon-livraison-' + String(fiche.reference || 'BL').replace(/[^a-zA-Z0-9]/g, '-') + '-' + Date.now() + '.pdf';
      const filepath = path.join(OUTPUT_DIR, filename);
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // === EN-TETE ===
      const logoSize = 44;
      let hasLogo = false;
      try {
        if (fs.existsSync(LOGO_PATH)) {
          doc.image(LOGO_PATH, MARGIN, MARGIN, { width: logoSize, height: logoSize });
          hasLogo = true;
        }
      } catch (e) { /* logo non disponible */ }
      const titleX = hasLogo ? MARGIN + logoSize + 14 : MARGIN;

      doc.fontSize(10).font('Helvetica-Bold').fillColor(BLACK);
      doc.text('NIZAR TRANSPORT VOYAGEUR', titleX, MARGIN + 2, { align: 'left' });
      doc.fontSize(17).font('Helvetica-Bold').fillColor(TEAL);
      doc.text('BON DE LIVRAISON', titleX, MARGIN + 17, { align: 'left' });
      doc.fontSize(8).font('Helvetica').fillColor(MEDIUM_GRAY);
      doc.text('N° ' + (fiche.reference || ''), titleX, MARGIN + 40, { align: 'left' });

      const sepY = MARGIN + logoSize + 8;
      doc.moveTo(MARGIN, sepY).lineTo(PAGE_W - MARGIN, sepY).strokeColor(TEAL).lineWidth(2).stroke();
      doc.strokeColor(BLACK).lineWidth(0.5);

      // === BLOC INFOS ===
      let infoY = sepY + 18;
      doc.fontSize(9.5).fillColor(BLACK);
      doc.font('Helvetica-Bold').text('Fournisseur : ', MARGIN, infoY, { continued: true });
      doc.font('Helvetica').text(fiche.fournisseur_nom || '-');
      doc.font('Helvetica-Bold').text('Date : ', MARGIN + 300, infoY, { continued: true });
      doc.font('Helvetica').text(formatDate(fiche.date_entree));

      infoY += 16;
      doc.font('Helvetica-Bold').text('N° BL fournisseur : ', MARGIN, infoY, { continued: true });
      doc.font('Helvetica').text(fiche.numero_bl || '-');
      doc.font('Helvetica-Bold').text('N° fiche de besoin : ', MARGIN + 300, infoY, { continued: true });
      doc.font('Helvetica').text(fiche.numero_fiche_besoin || '-');

      infoY += 26;

      // === TABLEAU ===
      const colW = [230, 110, 60, 55];
      const colX = [MARGIN, MARGIN + 230, MARGIN + 340, MARGIN + 400];
      const headers = ['Article', 'N° Souche', 'Quantité', 'Unité'];
      const HEADER_H = 20;
      const maxBottom = PAGE_H - 140;

      function drawHeader(y) {
        doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fill(BLACK);
        doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], colX[i] + 4, y + 5, { width: colW[i] - 8, align: i === 0 ? 'left' : 'center' });
        }
        doc.fillColor(BLACK);
      }

      drawHeader(infoY);
      let rowY = infoY + HEADER_H;

      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        if (rowY + 20 > maxBottom) {
          doc.addPage();
          rowY = MARGIN + 10;
          drawHeader(rowY);
          rowY += HEADER_H;
        }
        if (i % 2 === 0) {
          doc.rect(MARGIN, rowY, CONTENT_W, 20).fill(LIGHT_GRAY);
          doc.fillColor(BLACK);
        }
        doc.font('Helvetica').fontSize(9);
        doc.text(String(l.article_nom || '-'), colX[0] + 4, rowY + 4, { width: colW[0] - 8 });
        const plage = (l.numero_debut && l.numero_fin) ? (String(l.numero_debut) + ' - ' + String(l.numero_fin)) : '-';
        doc.text(plage, colX[1] + 4, rowY + 4, { width: colW[1] - 8, align: 'center' });
        doc.text(String(l.quantite), colX[2] + 4, rowY + 4, { width: colW[2] - 8, align: 'center' });
        doc.text(ficheUniteLabel(l.unite), colX[3] + 4, rowY + 4, { width: colW[3] - 8, align: 'center' });
        rowY += 20;
      }

      // === SIGNATURES ===
      let sigY = Math.max(rowY + 40, PAGE_H - 130);
      doc.moveTo(MARGIN, sigY).lineTo(MARGIN + 180, sigY).strokeColor(BLACK).lineWidth(0.5).stroke();
      doc.fontSize(9).font('Helvetica-Bold').text('LIVREUR', MARGIN, sigY + 5);
      doc.moveTo(PAGE_W - MARGIN - 180, sigY).lineTo(PAGE_W - MARGIN, sigY).stroke();
      doc.text('GESTIONNAIRE DE STOCK', PAGE_W - MARGIN - 180, sigY + 5);

      // === PIED DE PAGE ===
      doc.fontSize(7).font('Helvetica').fillColor(MEDIUM_GRAY);
      doc.text('Document genere par le systeme en l\'absence de bon de livraison fournisseur — Nizar Stock', MARGIN, PAGE_H - 35, { align: 'center', width: CONTENT_W });

      doc.end();
      stream.on('finish', () => resolve('/uploads/' + filename));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}
```

- [ ] **Step 2: Export it**

In `services/pdf.js`, change the final line:
```js
module.exports = { generateFichePDF, generateStockPDF };
```
to:
```js
module.exports = { generateFichePDF, generateStockPDF, generateBonLivraisonPDF };
```

- [ ] **Step 3: Smoke-test the generator directly (no server needed)**

```bash
node -e "
const { generateBonLivraisonPDF } = require('./services/pdf');
generateBonLivraisonPDF(
  { reference: 'FE-2608-001', fournisseur_nom: 'Papeterie Test', date_entree: new Date().toISOString(), numero_bl: null, numero_fiche_besoin: 'FB-2608-001' },
  [
    { article_nom: 'Carnet voyageur', quantite: 50, numero_debut: '160001', numero_fin: '160050', unite: 'carnet' },
    { article_nom: 'Scotch emballage', quantite: 6, numero_debut: null, numero_fin: null, unite: 'unite' }
  ]
).then(p => console.log('OK:', p)).catch(e => { console.error('FAIL:', e.message); process.exit(1); });
"
```
Expected: prints `OK: /uploads/bon-livraison-FE-2608-001-<timestamp>.pdf` with no error.

- [ ] **Step 4: Visually verify the layout**

Read the generated file with the Read tool (path: `public/uploads/bon-livraison-FE-2608-001-*.pdf`, resolve the exact filename with `ls public/uploads/ | grep bon-livraison | tail -1`). Confirm: title "BON DE LIVRAISON" in teal under "NIZAR TRANSPORT VOYAGEUR", fournisseur/date/N° BL/N° fiche de besoin block readable, table with the two sample lines correctly aligned, signature lines "LIVREUR" / "GESTIONNAIRE DE STOCK" near the bottom. If any text overlaps or overflows the page width, adjust the offending `x`/`width` values in Step 1 and re-run Step 3.

Clean up the test file:
```bash
rm -f public/uploads/bon-livraison-FE-2608-001-*.pdf
```

- [ ] **Step 5: Commit**

```bash
git add services/pdf.js
git commit -m "feat: generation PDF du bon de livraison (entrees sans BL fournisseur)"
```

---

### Task 3: Entrées — numero_fiche_besoin, generation route, PDF re-download, updated validation gate

**Files:**
- Modify: `routes/entrees.js`

**Interfaces:**
- Consumes: `generateBonLivraisonPDF` from Task 2 (`require('../services/pdf')`).
- Produces: `POST /api/entrees/:id/bon-livraison`, `GET /api/entrees/:id/pdf` — consumed by frontend Task 8/10.

- [ ] **Step 1: Accept `numero_fiche_besoin` on create**

In `routes/entrees.js`, `POST /` handler (around line 76-115), change the destructure:
```js
  const { fournisseur_id, numero_bl, numero_facture, notes, articles } = req.body;
```
to:
```js
  const { fournisseur_id, numero_bl, numero_facture, numero_fiche_besoin, notes, articles } = req.body;
```

Then change the INSERT (around line 98-101):
```js
      const result = db.prepare(`
        INSERT INTO fiches_entree (reference, fournisseur_id, date_entree, numero_bl, numero_facture, notes, user_id, statut, validee, articles_json)
        VALUES (?, ?, datetime('now','localtime'), ?, ?, ?, ?, 'validee', 0, ?)
      `).run(reference, fournisseur_id || null, numero_bl || null, numero_facture || null, notes || null, req.user.id, JSON.stringify(articles));
```
to:
```js
      const result = db.prepare(`
        INSERT INTO fiches_entree (reference, fournisseur_id, date_entree, numero_bl, numero_facture, numero_fiche_besoin, notes, user_id, statut, validee, articles_json)
        VALUES (?, ?, datetime('now','localtime'), ?, ?, ?, ?, ?, 'validee', 0, ?)
      `).run(reference, fournisseur_id || null, numero_bl || null, numero_facture || null, numero_fiche_besoin || null, notes || null, req.user.id, JSON.stringify(articles));
```

- [ ] **Step 2: Add a `buildLignesForPDF` helper and the generation route**

Near the top of `routes/entrees.js`, after the `generateRef` function, add:

```js
// Construit les lignes { article_nom, quantite, numero_debut, numero_fin, unite } pour le PDF,
// depuis articles_json (brouillon, avant validation) ou fiche_entree_articles (apres validation).
function buildLignesForPDF(db, fiche) {
  if (fiche.validee) {
    return db.prepare(`
      SELECT fea.quantite, fea.numero_debut, fea.numero_fin, a.nom as article_nom, a.unite
      FROM fiche_entree_articles fea LEFT JOIN articles a ON fea.article_id = a.id
      WHERE fea.fiche_id = ?
    `).all(fiche.id);
  }
  let articles;
  try { articles = JSON.parse(fiche.articles_json || '[]'); } catch (e) { articles = []; }
  return articles.map(function(art) {
    const a = db.prepare('SELECT nom, unite FROM articles WHERE id = ?').get(art.article_id);
    return {
      quantite: art.quantite,
      numero_debut: art.numero_debut || null,
      numero_fin: art.numero_fin || null,
      article_nom: a ? a.nom : ('Article #' + art.article_id),
      unite: a ? a.unite : ''
    };
  });
}
```

Then, after the `router.get('/:id', ...)` handler (around line 72), add the two new routes:

```js
// POST /api/entrees/:id/bon-livraison — genere (ou regenere) le PDF quand le
// fournisseur n'a transmis aucun bon de livraison papier
router.post('/:id/bon-livraison', authenticate, async (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fe.*, f.nom as fournisseur_nom FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id WHERE fe.id = ?
  `).get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });

  const lignes = buildLignesForPDF(db, fiche);
  if (!lignes.length) return res.status(400).json({ error: 'Aucun article sur cette entree : impossible de generer le bon de livraison.' });

  try {
    const { generateBonLivraisonPDF } = require('../services/pdf');
    const pdfPath = await generateBonLivraisonPDF(fiche, lignes);
    db.prepare('UPDATE fiches_entree SET fichier_path = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(pdfPath, req.params.id);
    logAudit(db, req.user.id, req.user.username, 'GENERER_BL', fiche.reference || String(req.params.id));
    res.json({ fichier_path: pdfPath, message: 'Bon de livraison genere.' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur generation PDF: ' + err.message });
  }
});

// GET /api/entrees/:id/pdf — telecharger/re-imprimer le bon de livraison genere
router.get('/:id/pdf', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_entree WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: "Fiche d'entree introuvable." });
  if (!fiche.fichier_path) return res.status(404).json({ error: "Aucun bon de livraison genere pour cette entree." });

  const fullPath = path.join(__dirname, '..', 'public', fiche.fichier_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur.' });
  res.download(fullPath);
});
```

- [ ] **Step 3: Update the `hasBL` gate in `POST /:id/valider`**

In `routes/entrees.js`, in the `/:id/valider` handler (around line 126-134), change:
```js
  // Photo du bon de livraison ET de la facture obligatoires
  const hasBL = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'bl'").get(req.params.id).c;
  const hasFacture = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'facture'").get(req.params.id).c;
  if (hasBL === 0 || hasFacture === 0) {
    const missing = [];
    if (hasBL === 0) missing.push('bon de livraison');
    if (hasFacture === 0) missing.push('facture');
    return res.status(400).json({ error: 'Validation impossible : photo ' + missing.join(' et photo ') + ' manquante.' });
  }
```
to:
```js
  // Bon de livraison : photo fournisseur OU PDF genere par l'app. Facture : photo obligatoire (inchange).
  const hasPhotoBL = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'bl'").get(req.params.id).c > 0;
  const hasFacture = db.prepare("SELECT COUNT(*) as c FROM fiche_entree_photos WHERE fiche_id = ? AND type = 'facture'").get(req.params.id).c > 0;
  const hasBL = hasPhotoBL || !!fiche.fichier_path;
  if (!hasBL || !hasFacture) {
    const missing = [];
    if (!hasBL) missing.push('bon de livraison (photo ou generation)');
    if (!hasFacture) missing.push('facture');
    return res.status(400).json({ error: 'Validation impossible : ' + missing.join(' et ') + ' manquant.' });
  }
```

- [ ] **Step 4: Verify with a disposable test server**

Set up a fresh test db and upload dir, start the server on port 3099 with cloud backup disabled:
```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
```

Log in and capture the token:
```bash
TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
echo "token: ${TOKEN:0:12}..."
```

Create an article, then create a draft entrée with `numero_fiche_besoin`, generate the bon de livraison, download it, and validate (facture photo still required so validation is expected to fail here — that's the point, it isolates the BL-generation gate):
```bash
ARTICLE_ID=$(curl -s -X POST http://localhost:3099/api/articles -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reference":"TST-001","nom":"Article Test","unite":"unite","type_article":"standard"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).article.id))")

ENTREE=$(curl -s -X POST http://localhost:3099/api/entrees -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"numero_bl\":null,\"numero_fiche_besoin\":\"FB-2608-001\",\"articles\":[{\"article_id\":$ARTICLE_ID,\"quantite\":5}]}")
echo "$ENTREE" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('id:',j.fiche.id,'numero_fiche_besoin:',j.fiche.numero_fiche_besoin)})"
ENTREE_ID=$(echo "$ENTREE" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).fiche.id))")

curl -s -X POST http://localhost:3099/api/entrees/$ENTREE_ID/bon-livraison -H "Authorization: Bearer $TOKEN"
echo
curl -s -o /tmp/dl-test.pdf -w "HTTP %{http_code}, %{size_download} bytes\n" http://localhost:3099/api/entrees/$ENTREE_ID/pdf -H "Authorization: Bearer $TOKEN"
file /tmp/dl-test.pdf

curl -s -X POST http://localhost:3099/api/entrees/$ENTREE_ID/valider -H "Authorization: Bearer $TOKEN"
```

Expected: `numero_fiche_besoin: FB-2608-001` on the created fiche; `bon-livraison` call returns `{"fichier_path":"/uploads/bon-livraison-...","message":"Bon de livraison genere."}`; `pdf` download returns `HTTP 200` and `file` reports `PDF document`; the final `valider` call returns `400` with an error mentioning only `facture` missing (confirms the BL photo requirement was satisfied by the generated PDF, and only the facture gate still blocks — proving Step 3's logic works).

Stop the server and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db /tmp/dl-test.pdf && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 5: Commit**

```bash
git add routes/entrees.js
git commit -m "feat: entrees — generation du bon de livraison et champ N° fiche de besoin"
```

---

### Task 4: Garde-fou stock — bloquer une sortie si stock insuffisant

**Files:**
- Modify: `routes/fiches_reception.js:100-145` (`POST /` transaction)

**Interfaces:**
- No new interfaces — pure business-rule tightening on an existing route.

- [ ] **Step 1: Add the stock check inside the transaction loop**

In `routes/fiches_reception.js`, inside the `POST /` transaction's `for (const art of articles)` loop (around line 125-144), the comment block currently reads:
```js
      const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.article_id);
      if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');
      // Pas de contrôle de stock : le gestionnaire enregistre les sorties même si le
      // stock théorique est à 0 (le stock réel est géré à part).
```
Replace it with:
```js
      const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(art.article_id);
      if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');

      // Garde-fou : jamais de stock negatif. Bloquant pour tous les roles (un test
      // recent a laisse un article passer a -10 avant ce controle).
      if (article.stock_actuel < art.quantite) {
        throw new Error('Stock insuffisant pour ' + article.nom + ' : ' + article.stock_actuel + ' ' + (article.unite || '') + ' disponible(s), ' + art.quantite + ' demande(s).');
      }
```

- [ ] **Step 2: Verify with a disposable test server**

```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")

ARTICLE_ID=$(curl -s -X POST http://localhost:3099/api/articles -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reference":"TST-002","nom":"Article Zero Stock","unite":"unite","type_article":"standard"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).article.id))")
LOCALITE_ID=$(curl -s http://localhost:3099/api/localites -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).localites[0].id))")

echo "--- Sortie sur stock a 0 (doit etre refusee) ---"
curl -s -w "\nHTTP %{http_code}\n" -X POST http://localhost:3099/api/fiches -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"localite_id\":$LOCALITE_ID,\"articles\":[{\"article_id\":$ARTICLE_ID,\"quantite\":3}]}"
```

Expected: `HTTP 400` with an error message containing `Stock insuffisant pour Article Zero Stock`.

Now verify a valid sortie still works (stock sufficient):
```bash
curl -s -X POST http://localhost:3099/api/mouvements -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"article_id\":$ARTICLE_ID,\"type\":\"entree\",\"quantite\":10}" > /dev/null
echo "--- Sortie sur stock suffisant (doit reussir) ---"
curl -s -w "\nHTTP %{http_code}\n" -X POST http://localhost:3099/api/fiches -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"localite_id\":$LOCALITE_ID,\"articles\":[{\"article_id\":$ARTICLE_ID,\"quantite\":3}]}"
```
Expected: `HTTP 201`, fiche created.

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 3: Commit**

```bash
git add routes/fiches_reception.js
git commit -m "fix: bloque une sortie si le stock reel est insuffisant"
```

---

### Task 5: Fiches de besoin — backend

**Files:**
- Create: `routes/fiches_besoin.js`
- Modify: `server.js:69-70` (mount the route)

**Interfaces:**
- Produces: `GET/POST /api/fiches-besoin`, `GET /api/fiches-besoin/:id`, `PATCH /api/fiches-besoin/:id/statut`, `POST /api/fiches-besoin/:id/scan`, `DELETE /api/fiches-besoin/:id`.
- Consumes: `createUpload` from `services/uploads.js`, `logAudit` from `services/audit.js` (same as `routes/entrees.js`).

- [ ] **Step 1: Write the route file**

Create `routes/fiches_besoin.js`:

```js
// routes/fiches_besoin.js — Fiches de besoin (demande d'achat -> service achat -> retour scanne)
const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { createUpload } = require('../services/uploads');
const { logAudit } = require('../services/audit');
const router = express.Router();

const upload = createUpload('scan');

function generateRef(db) {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'fiches_besoin'").get();
  const next = (seq ? seq.seq : 0) + 1;
  return 'FB-' + y + m + '-' + String(next).padStart(3, '0');
}

// GET /api/fiches-besoin — liste
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { statut, debut, fin } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (statut) { where += ' AND fb.statut = ?'; params.push(statut); }
  if (debut) { where += ' AND fb.date_creation >= ?'; params.push(debut); }
  if (fin) { where += ' AND fb.date_creation <= ?'; params.push(fin + ' 23:59:59'); }

  const fiches = db.prepare(`
    SELECT fb.*, u.username as cree_par,
      (SELECT COUNT(*) FROM fiche_besoin_articles WHERE fiche_id = fb.id) as nb_lignes
    FROM fiches_besoin fb
    LEFT JOIN users u ON fb.user_id = u.id
    ${where}
    ORDER BY fb.id DESC LIMIT 200
  `).all(...params);
  res.json({ fiches });
});

// GET /api/fiches-besoin/:id — detail
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const fiche = db.prepare(`
    SELECT fb.*, u.username as cree_par FROM fiches_besoin fb LEFT JOIN users u ON fb.user_id = u.id WHERE fb.id = ?
  `).get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });

  const lignes = db.prepare(`
    SELECT fba.*, a.nom as article_nom, a.reference, a.unite
    FROM fiche_besoin_articles fba LEFT JOIN articles a ON fba.article_id = a.id
    WHERE fba.fiche_id = ?
  `).all(req.params.id);
  res.json({ fiche, lignes });
});

// POST /api/fiches-besoin — creer
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { notes, articles } = req.body;
  if (!articles || !articles.length) return res.status(400).json({ error: 'Au moins un article requis.' });

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
        INSERT INTO fiches_besoin (reference, notes, user_id, statut)
        VALUES (?, ?, ?, 'creee')
      `).run(reference, notes || null, req.user.id);
      ficheId = result.lastInsertRowid;

      const insertLigne = db.prepare(`
        INSERT INTO fiche_besoin_articles (fiche_id, article_id, quantite, observation)
        VALUES (?, ?, ?, ?)
      `);
      for (const art of articles) {
        const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(art.article_id);
        if (!article) throw new Error('Article #' + art.article_id + ' introuvable.');
        insertLigne.run(ficheId, art.article_id, art.quantite, art.observation || null);
      }
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(ficheId);
  logAudit(db, req.user.id, req.user.username, 'CREER_FICHE_BESOIN', reference);
  res.status(201).json({ fiche });
});

// PATCH /api/fiches-besoin/:id/statut — transmise | archivee
router.patch('/:id/statut', authenticate, (req, res) => {
  const db = req.db;
  const { statut } = req.body;
  if (!['transmise', 'archivee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide (transmise ou archivee).' });
  }

  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });

  if (statut === 'transmise' && fiche.statut !== 'creee') {
    return res.status(400).json({ error: 'Seule une fiche « creee » peut etre marquee transmise.' });
  }
  if (statut === 'archivee' && fiche.statut !== 'revenue') {
    return res.status(400).json({ error: 'Marquez d\'abord le retour (scan) avant d\'archiver.' });
  }

  db.prepare('UPDATE fiches_besoin SET statut = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(statut, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'STATUT_FICHE_BESOIN', (fiche.reference || req.params.id) + ' -> ' + statut);

  const updated = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  res.json({ fiche: updated });
});

// POST /api/fiches-besoin/:id/scan — upload du retour signe -> statut revenue
router.post('/:id/scan', authenticate, upload, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });
  if (!req.file) return res.status(400).json({ error: 'Scan requis.' });
  if (fiche.statut !== 'transmise') return res.status(400).json({ error: 'La fiche doit etre « transmise » avant d\'enregistrer un retour.' });

  const scanPath = '/uploads/' + req.file.filename;
  db.prepare('UPDATE fiches_besoin SET scan_path = ?, statut = \'revenue\', updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(scanPath, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'SCAN_FICHE_BESOIN', fiche.reference || String(req.params.id));

  const updated = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  res.json({ fiche: updated });
});

// DELETE /api/fiches-besoin/:id (admin)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const fiche = db.prepare('SELECT * FROM fiches_besoin WHERE id = ?').get(req.params.id);
  if (!fiche) return res.status(404).json({ error: 'Fiche de besoin introuvable.' });

  db.prepare('DELETE FROM fiches_besoin WHERE id = ?').run(req.params.id);
  logAudit(db, req.user.id, req.user.username, 'SUPPR_FICHE_BESOIN', fiche.reference || String(req.params.id));

  if (fiche.scan_path) {
    const uploadsDir = require('../services/paths').uploadDir;
    const full = path.resolve(uploadsDir, String(fiche.scan_path).replace(/^\/uploads\//, ''));
    if (fs.existsSync(full)) { try { fs.unlinkSync(full); } catch (e) { /* deja supprime */ } }
  }

  res.json({ message: 'Fiche de besoin supprimee.' });
});

module.exports = router;
```

- [ ] **Step 2: Mount the route in `server.js`**

In `server.js`, right after `app.use('/api/entrees', require('./routes/entrees'));` (line 69), add:
```js
app.use('/api/fiches-besoin', require('./routes/fiches_besoin'));
```

- [ ] **Step 3: Verify the full pipeline end-to-end**

```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
ARTICLE_ID=$(curl -s -X POST http://localhost:3099/api/articles -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reference":"TST-003","nom":"Article Besoin","unite":"unite","type_article":"standard"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).article.id))")

echo "--- Creation ---"
FB=$(curl -s -X POST http://localhost:3099/api/fiches-besoin -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"notes\":\"Test\",\"articles\":[{\"article_id\":$ARTICLE_ID,\"quantite\":20}]}")
echo "$FB"
FB_ID=$(echo "$FB" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).fiche.id))")

echo "--- Transmise ---"
curl -s -X PATCH http://localhost:3099/api/fiches-besoin/$FB_ID/statut -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"statut":"transmise"}'

echo -e "\n--- Archivage premature (doit echouer, statut != revenue) ---"
curl -s -w "\nHTTP %{http_code}\n" -X PATCH http://localhost:3099/api/fiches-besoin/$FB_ID/statut -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"statut":"archivee"}'

echo "--- Scan retour ---"
printf '%%PDF-1.3 test' > /tmp/scan-test.pdf
curl -s -X POST http://localhost:3099/api/fiches-besoin/$FB_ID/scan -H "Authorization: Bearer $TOKEN" -F "scan=@/tmp/scan-test.pdf"

echo -e "\n--- Archivage (doit reussir) ---"
curl -s -w "\nHTTP %{http_code}\n" -X PATCH http://localhost:3099/api/fiches-besoin/$FB_ID/statut -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"statut":"archivee"}'
```

Expected: creation returns `201` with `statut: "creee"`; transmise succeeds (`statut: "transmise"`); premature archivage returns `HTTP 400`; scan upload returns `statut: "revenue"` and a `scan_path`; final archivage returns `HTTP 200` with `statut: "archivee"`.

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db /tmp/scan-test.pdf && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 4: Commit**

```bash
git add routes/fiches_besoin.js server.js
git commit -m "feat: module fiches de besoin (demande d'achat -> service achat -> retour)"
```

---

### Task 6: Grand livre — backend (journal + export)

**Files:**
- Modify: `routes/inventaires.js`

**Interfaces:**
- Produces: `GET /api/inventaires/journal`, `GET /api/inventaires/journal/export`.

- [ ] **Step 1: Add the journal query and export route**

In `routes/inventaires.js`, add `const ExcelJS = require('exceljs');` to the top requires, then append these two routes before `module.exports = router;`:

```js
// GET /api/inventaires/journal — grand livre chronologique (solde cumule par article)
router.get('/journal', authenticate, (req, res) => {
  const db = req.db;
  const { article_id, debut, fin } = req.query;

  let where = 'WHERE 1=1';
  const params = [];
  if (article_id) { where += ' AND m.article_id = ?'; params.push(article_id); }
  if (debut) { where += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { where += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }

  const rows = db.prepare(`
    SELECT m.id, m.article_id, m.date, m.type, m.quantite, a.nom as article_nom, a.unite
    FROM mouvements m LEFT JOIN articles a ON m.article_id = a.id
    ${where}
    ORDER BY m.article_id ASC, m.date ASC, m.id ASC
  `).all(...params);

  // Solde cumule par article, dans l'ordre chronologique (comme un releve).
  const soldes = {};
  const lignes = rows.map((r) => {
    if (soldes[r.article_id] === undefined) soldes[r.article_id] = 0;
    soldes[r.article_id] += r.type === 'entree' ? r.quantite : -r.quantite;
    return {
      date: r.date,
      article_id: r.article_id,
      article_nom: r.article_nom,
      unite: r.unite,
      entree: r.type === 'entree' ? r.quantite : 0,
      sortie: r.type === 'sortie' ? r.quantite : 0,
      stock_reel: soldes[r.article_id]
    };
  });

  res.json({ lignes });
});

// GET /api/inventaires/journal/export — export .xlsx du grand livre (memes filtres)
router.get('/journal/export', authenticate, async (req, res) => {
  const db = req.db;
  const { article_id, debut, fin } = req.query;

  let where = 'WHERE 1=1';
  const params = [];
  if (article_id) { where += ' AND m.article_id = ?'; params.push(article_id); }
  if (debut) { where += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { where += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }

  const rows = db.prepare(`
    SELECT m.article_id, m.date, m.type, m.quantite, a.nom as article_nom, a.unite
    FROM mouvements m LEFT JOIN articles a ON m.article_id = a.id
    ${where}
    ORDER BY m.article_id ASC, m.date ASC, m.id ASC
  `).all(...params);

  const soldes = {};
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Grand livre');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 20 },
    { header: 'Article', key: 'article', width: 30 },
    { header: 'Entree', key: 'entree', width: 12 },
    { header: 'Sortie', key: 'sortie', width: 12 },
    { header: 'Stock reel', key: 'stock_reel', width: 14 }
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

  for (const r of rows) {
    if (soldes[r.article_id] === undefined) soldes[r.article_id] = 0;
    soldes[r.article_id] += r.type === 'entree' ? r.quantite : -r.quantite;
    sheet.addRow({
      date: r.date,
      article: r.article_nom,
      entree: r.type === 'entree' ? r.quantite : '',
      sortie: r.type === 'sortie' ? r.quantite : '',
      stock_reel: soldes[r.article_id]
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=grand-livre.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});
```

- [ ] **Step 2: Verify — cumulative balance and export**

```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
ARTICLE_ID=$(curl -s -X POST http://localhost:3099/api/articles -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reference":"TST-004","nom":"Article Journal","unite":"unite","type_article":"standard"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).article.id))")

curl -s -X POST http://localhost:3099/api/mouvements -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"article_id\":$ARTICLE_ID,\"type\":\"entree\",\"quantite\":10}" > /dev/null
curl -s -X POST http://localhost:3099/api/mouvements -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"article_id\":$ARTICLE_ID,\"type\":\"sortie\",\"quantite\":4}" > /dev/null
curl -s -X POST http://localhost:3099/api/mouvements -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"article_id\":$ARTICLE_ID,\"type\":\"entree\",\"quantite\":3}" > /dev/null

echo "--- Journal (attendu : soldes 10, 6, 9) ---"
curl -s "http://localhost:3099/api/inventaires/journal?article_id=$ARTICLE_ID" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{JSON.parse(d).lignes.forEach(l=>console.log(l.entree, l.sortie, '-> stock_reel:', l.stock_reel))})"

echo "--- Coherence avec stock_actuel de l'article (attendu : 9) ---"
curl -s http://localhost:3099/api/articles/$ARTICLE_ID -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log('stock_actuel:', JSON.parse(d).article.stock_actuel))"

echo "--- Export Excel ---"
curl -s -o /tmp/journal-test.xlsx -w "HTTP %{http_code}\n" "http://localhost:3099/api/inventaires/journal/export?article_id=$ARTICLE_ID" -H "Authorization: Bearer $TOKEN"
file /tmp/journal-test.xlsx
```

Expected: journal prints three lines with `stock_reel` progressing `10`, `6`, `9`; the article's `stock_actuel` is also `9` (confirms the cumulative journal matches the real running stock); export returns `HTTP 200` and `file` reports a Microsoft Excel / Zip archive (xlsx) type.

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db /tmp/journal-test.xlsx && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 3: Commit**

```bash
git add routes/inventaires.js
git commit -m "feat: grand livre chronologique + export Excel"
```

---

### Task 7: Anomalies d'import — backend + parseRange hardening

**Files:**
- Modify: `routes/mouvements.js`, `scripts/import_v2.js:44-54`

**Interfaces:**
- Produces: `GET /api/mouvements/anomalies`, `PATCH /api/mouvements/:id/numero`.
- Consumes: `checkOverlap`, `recordSerie`, `parseNumero` from `services/series.js` (already imported pattern in `entrees.js`/`retours.js`).

- [ ] **Step 1: Harden `parseRange` in `scripts/import_v2.js`**

Replace the current `parseRange` (lines 44-54):
```js
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
```
with:
```js
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
```

- [ ] **Step 2: Verify the parser fix in isolation**

```bash
node -e "
$(sed -n '/^function parseRange/,/^}/p' scripts/import_v2.js)
const cases = [['6001-6100', {debut:6001,fin:6100}], ['501', {debut:501,fin:501}], ['6001 a 6100', null], ['6001,6100', null], ['', null], [null, null]];
let ok = true;
for (const [input, expected] of cases) {
  const got = parseRange(input);
  const pass = JSON.stringify(got) === JSON.stringify(expected);
  console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(input), '->', JSON.stringify(got));
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
"
```
Expected: all six cases print `PASS` (the malformed `'6001 a 6100'` and `'6001,6100'` now correctly return `null` instead of a merged/garbage number).

- [ ] **Step 3: Add anomalies routes to `routes/mouvements.js`**

Add these imports at the top of `routes/mouvements.js`:
```js
const { checkOverlap, recordSerie } = require('../services/series');
const { logAudit } = require('../services/audit');
```

Then, before `module.exports = router;`, add:
```js
// GET /api/mouvements/anomalies — mouvements d'articles numerotes sans plage de
// numeros valide (essentiellement issus de l'import historique).
router.get('/anomalies', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const anomalies = db.prepare(`
    SELECT m.id, m.date, m.type, m.quantite, m.motif, a.id as article_id, a.nom as article_nom, l.nom as localite_nom
    FROM mouvements m
    JOIN articles a ON m.article_id = a.id
    LEFT JOIN localites l ON m.localite_id = l.id
    WHERE a.type_article = 'numerote' AND (m.numero_debut IS NULL OR m.numero_fin IS NULL)
    ORDER BY m.date ASC, m.id ASC
    LIMIT 500
  `).all();
  res.json({ anomalies });
});

// PATCH /api/mouvements/:id/numero — correction manuelle admin d'une plage manquante
router.patch('/:id/numero', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { numero_debut, numero_fin } = req.body;

  const mvt = db.prepare('SELECT m.*, a.type_article, a.nom as article_nom FROM mouvements m JOIN articles a ON m.article_id = a.id WHERE m.id = ?').get(req.params.id);
  if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
  if (mvt.numero_debut || mvt.numero_fin) return res.status(400).json({ error: 'Ce mouvement a deja une plage de numeros enregistree.' });

  try {
    const transaction = db.transaction(() => {
      const overlap = checkOverlap(db, mvt.article_id, numero_debut, numero_fin, mvt.type === 'entree' ? 'entree' : 'sortie');
      if (overlap) throw new Error('Chevauchement pour ' + mvt.article_nom + ' : plage ' + numero_debut + '-' + numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');

      db.prepare('UPDATE mouvements SET numero_debut = ?, numero_fin = ? WHERE id = ?').run(String(numero_debut), String(numero_fin), req.params.id);
      recordSerie(db, mvt.article_id, numero_debut, numero_fin, mvt.quantite, mvt.type === 'entree' ? 'entree' : 'sortie', req.params.id);
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  logAudit(db, req.user.id, req.user.username, 'CORRIGER_NUMERO', mvt.article_nom + ' — mouvement #' + req.params.id + ' -> ' + numero_debut + '-' + numero_fin);
  const updated = db.prepare('SELECT * FROM mouvements WHERE id = ?').get(req.params.id);
  res.json({ mouvement: updated });
});
```

- [ ] **Step 4: Verify anomalies detection and correction**

```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
TOKEN=$(curl -s -X POST http://localhost:3099/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
ARTICLE_ID=$(curl -s -X POST http://localhost:3099/api/articles -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reference":"TST-005","nom":"Carnet Anomalie","unite":"carnet","type_article":"numerote"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).article.id))")

# Un mouvement sans numero_debut/fin, insere directement (simule une ligne d'import sans numero)
node -e "
const db = require('better-sqlite3')('/tmp/nizar-test.db');
db.prepare(\"INSERT INTO mouvements (article_id, type, quantite, motif, date) VALUES (?, 'sortie', 1, 'Import historique 2026', datetime('now'))\").run($ARTICLE_ID);
db.close();
"

echo "--- Anomalies (doit lister 1 mouvement) ---"
ANOM=$(curl -s http://localhost:3099/api/mouvements/anomalies -H "Authorization: Bearer $TOKEN")
echo "$ANOM"
MVT_ID=$(echo "$ANOM" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).anomalies[0].id))")

echo "--- Correction ---"
curl -s -w "\nHTTP %{http_code}\n" -X PATCH http://localhost:3099/api/mouvements/$MVT_ID/numero -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"numero_debut":"6001","numero_fin":"6100"}'

echo "--- Anomalies apres correction (doit etre vide) ---"
curl -s http://localhost:3099/api/mouvements/anomalies -H "Authorization: Bearer $TOKEN"
```

Expected: first `anomalies` call lists exactly one entry for `Carnet Anomalie`; the `PATCH` returns `HTTP 200` with `numero_debut: "6001"`, `numero_fin: "6100"`; the final `anomalies` call returns `{"anomalies":[]}`.

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 5: Commit**

```bash
git add routes/mouvements.js scripts/import_v2.js
git commit -m "feat: anomalies d'import corrigibles par l'admin + parseRange durci"
```

---

### Task 8: Frontend API client — new methods

**Files:**
- Modify: `public/js/api.js`

**Interfaces:**
- Produces: `API.getFichesBesoin`, `API.getFicheBesoin`, `API.createFicheBesoin`, `API.changeStatutFicheBesoin`, `API.uploadScanFicheBesoin`, `API.deleteFicheBesoin`, `API.genererBonLivraison`, `API.getEntreePdfUrl`, `API.getJournal`, `API.getJournalExportUrl`, `API.getAnomalies`, `API.corrigerNumeroMouvement`. Consumed by Tasks 9, 10, 11, 12.

- [ ] **Step 1: Add the methods**

In `public/js/api.js`, right after the `// Entrees` block (after `uploadEntreePhoto`, before `getSeriesArticle`, around line 414), add:

```js
  async genererBonLivraison(id) {
    return this.fetch('/api/entrees/' + id + '/bon-livraison', { method: 'POST' });
  },

  getEntreePdfUrl(id) {
    return '/api/entrees/' + id + '/pdf';
  },
```

Right after the `// Inventaires` block (after `createInventaire`, before `// Import Excel`, around line 436), add:

```js
  async getJournal(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/inventaires/journal' + (qs ? '?' + qs : ''));
  },

  getJournalExportUrl(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return '/api/inventaires/journal/export' + (qs ? '?' + qs : '');
  },
```

At the end of the object, right before the closing `};` (after `getBillets`, around line 468), add a comma to the previous entry and append:

```js
  // Anomalies d'import (admin)
  async getAnomalies() {
    return this.fetch('/api/mouvements/anomalies');
  },

  async corrigerNumeroMouvement(id, numero_debut, numero_fin) {
    return this.fetch('/api/mouvements/' + id + '/numero', {
      method: 'PATCH',
      body: JSON.stringify({ numero_debut, numero_fin })
    });
  },

  // Fiches de besoin
  async getFichesBesoin(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.fetch('/api/fiches-besoin' + (qs ? '?' + qs : ''));
  },

  async getFicheBesoin(id) {
    return this.fetch('/api/fiches-besoin/' + id);
  },

  async createFicheBesoin(data) {
    return this.fetch('/api/fiches-besoin', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async changeStatutFicheBesoin(id, statut) {
    return this.fetch('/api/fiches-besoin/' + id + '/statut', {
      method: 'PATCH',
      body: JSON.stringify({ statut })
    });
  },

  async uploadScanFicheBesoin(id, file) {
    var token = this.getToken();
    var formData = new FormData();
    formData.append('scan', file);
    var res = await fetch('/api/fiches-besoin/' + id + '/scan', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    return res.json();
  },

  async deleteFicheBesoin(id) {
    return this.fetch('/api/fiches-besoin/' + id, {
      method: 'DELETE'
    });
  }
```

- [ ] **Step 2: Syntax-check the file**

```bash
node --check public/js/api.js
```
Expected: no output (exit code 0 — the file is browser JS with `const`/arrow-less object methods, `node --check` only validates syntax, not execution).

- [ ] **Step 3: Commit**

```bash
git add public/js/api.js
git commit -m "feat: client API — fiches de besoin, bon de livraison, grand livre, anomalies"
```

---

### Task 9: Frontend — Fiches de besoin page + navigation

**Files:**
- Create: `public/js/fiches_besoin.js`
- Modify: `public/js/app.js` (nav arrays, `pages` map, `QUICK_ACTIONS`/`QUICK_OPEN`), `public/index.html` (script tag)

**Interfaces:**
- Consumes: `API.getFichesBesoin`, `API.createFicheBesoin`, `API.changeStatutFicheBesoin`, `API.uploadScanFicheBesoin` (Task 8); `UI.modal`, `UI.toast`, `UI.autocomplete`, `UI.renderEmptyState`, `UI.renderSkeleton`, `UI.escapeHtml`, `UI.formatDate`, `UI.pickFile` (existing `public/js/ui.js`).
- Produces: global `FichesBesoin` object with `.render(container)` — consumed by `app.js`'s `pages` map.

- [ ] **Step 1: Write `public/js/fiches_besoin.js`**

```js
// public/js/fiches_besoin.js — Fiches de besoin (demande d'achat -> service achat -> retour)
var FichesBesoin = {
  _articleItems: [],
  _lignes: [],
  _acLignes: [],

  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Fiches de besoin</h3>' +
      '<button class="btn btn-primary" id="btn-new-besoin">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      ' Nouvelle fiche de besoin</button>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="besoin-statut"><option value="">Tous statuts</option><option value="creee">Creee</option><option value="transmise">Transmise</option><option value="revenue">Revenue</option><option value="archivee">Archivee</option></select>' +
      '<button class="btn btn-secondary btn-sm" id="btn-besoin-refresh">Actualiser</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Demande d\'achat interne : creee, transmise au service achat, puis archivee des reception du retour signe (scan).</p>' +
      '<div id="besoin-table">' + UI.renderSkeleton(6) + '</div>' +
      '</div>';

    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('btn-new-besoin').addEventListener('click', function() { self._showForm(); });
    document.getElementById('besoin-statut').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-besoin-refresh').addEventListener('click', function() { self._load(); });
  },

  _load: function() {
    var self = this;
    var params = {};
    var s = document.getElementById('besoin-statut').value;
    if (s) params.statut = s;

    API.getFichesBesoin(params).then(function(data) { self._renderTable(data.fiches); })
      .catch(function(err) {
        document.getElementById('besoin-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _statutBadge: function(statut) {
    var map = { creee: ['badge-warning', 'Creee'], transmise: ['badge-info', 'Transmise'], revenue: ['badge-success', 'Revenue'], archivee: ['badge-neutral', 'Archivee'] };
    var m = map[statut] || ['badge-neutral', statut];
    return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
  },

  _renderTable: function(fiches) {
    var el = document.getElementById('besoin-table');
    if (!fiches || !fiches.length) { el.innerHTML = UI.renderEmptyState('Aucune fiche de besoin', 'Nouvelle fiche de besoin', 'btn-new-besoin'); return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Reference</th><th>Date</th><th>Lignes</th><th>Statut</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < fiches.length; i++) {
      var f = fiches[i];
      html += '<tr>' +
        '<td><strong style="font-family:var(--font-heading);font-size:0.8rem">' + UI.escapeHtml(f.reference) + '</strong></td>' +
        '<td>' + UI.formatDate(f.date_creation) + '</td>' +
        '<td>' + f.nb_lignes + '</td>' +
        '<td>' + this._statutBadge(f.statut) + '</td>' +
        '<td class="actions">';
      if (f.statut === 'creee') {
        html += '<button class="btn btn-sm btn-warning btn-transmettre" data-id="' + f.id + '">Transmettre</button>';
      } else if (f.statut === 'transmise') {
        html += '<button class="btn btn-sm btn-success btn-scan-besoin" data-id="' + f.id + '">Scanner le retour</button>';
      } else if (f.statut === 'revenue') {
        html += '<button class="btn btn-sm btn-info btn-archiver-besoin" data-id="' + f.id + '">Archiver</button>';
      }
      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('.btn-transmettre').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatut(parseInt(this.dataset.id), 'transmise'); });
    });
    el.querySelectorAll('.btn-archiver-besoin').forEach(function(btn) {
      btn.addEventListener('click', function() { self._changeStatut(parseInt(this.dataset.id), 'archivee'); });
    });
    el.querySelectorAll('.btn-scan-besoin').forEach(function(btn) {
      btn.addEventListener('click', function() { self._scanRetour(parseInt(this.dataset.id)); });
    });
  },

  _changeStatut: function(id, statut) {
    var self = this;
    API.changeStatutFicheBesoin(id, statut)
      .then(function() { UI.toast('Statut mis a jour.', 'success'); self._load(); })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },

  _scanRetour: function(id) {
    var self = this;
    UI.pickFile(function(file) {
      if (!file) return;
      API.uploadScanFicheBesoin(id, file).then(function(data) {
        if (data && data.error) { UI.toast(data.error, 'error'); return; }
        UI.toast('Retour enregistre.', 'success');
        self._load();
      }).catch(function(err) { UI.toast(err.message, 'error'); });
    }, 'image/*,.pdf');
  },

  _showForm: function() {
    var self = this;
    self._lignes = [{ article_id: '', quantite: 1, article_nom: '' }];
    self._acLignes = [];

    var body =
      '<div class="form-group"><label class="form-label">Notes</label><input type="text" class="form-input" id="besoin-notes" placeholder="Optionnel"></div>' +
      '<div class="flex-between mb-sm"><strong>Articles souhaites</strong><button class="btn btn-sm btn-secondary" id="btn-add-besoin-line">+ Ajouter</button></div>' +
      '<div id="lignes-besoin"></div>';

    UI.modal('Nouvelle fiche de besoin', body, [
      { label: 'Annuler', cls: 'btn-secondary', callback: function(m) { m.close(); } },
      { label: 'Creer', cls: 'btn-primary', callback: function(m) { self._save(m); } }
    ]);

    document.getElementById('btn-add-besoin-line').addEventListener('click', function() {
      self._lignes.push({ article_id: '', quantite: 1, article_nom: '' });
      self._refreshLignes();
    });
    self._refreshLignes();
  },

  _refreshLignes: function() {
    var lc = document.getElementById('lignes-besoin');
    if (!lc) return;
    var h = '';
    for (var k = 0; k < this._lignes.length; k++) {
      h += '<div style="border:1px solid var(--color-border);border-radius:10px;padding:10px;margin-bottom:8px">' +
        '<div class="art-ac-besoin" data-idx="' + k + '"></div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:8px">' +
        '<input type="number" class="form-input qte-besoin" data-idx="' + k + '" value="' + (this._lignes[k].quantite || 1) + '" min="1" style="min-height:40px;width:110px">' +
        '<button class="btn btn-sm btn-danger btn-rm-besoin-line" data-idx="' + k + '" style="min-width:32px;min-height:40px">&times;</button>' +
        '</div></div>';
    }
    lc.innerHTML = h;
    this._bindLignes(lc);
  },

  _bindLignes: function(container) {
    var self = this;
    container.querySelectorAll('.art-ac-besoin').forEach(function(el) {
      var idx = parseInt(el.dataset.idx);
      var ac = UI.autocomplete(el, {
        items: [],
        placeholder: 'Rechercher un article...',
        search: function(term, cb) {
          API.getArticles({ search: term }).then(function(data) {
            cb(data.articles.map(function(a) { return { id: a.id, label: a.nom, meta: 'Stock: ' + a.stock_actuel }; }));
          }).catch(function() { cb([]); });
        },
        onSelect: function(item) {
          self._lignes[idx].article_id = item.id;
          self._lignes[idx].article_nom = item.label;
        }
      });
      self._acLignes[idx] = ac;
      if (self._lignes[idx] && self._lignes[idx].article_id) {
        ac.setItem({ id: self._lignes[idx].article_id, label: self._lignes[idx].article_nom || '' });
      }
    });
    container.querySelectorAll('.qte-besoin').forEach(function(el) {
      el.addEventListener('input', function() { self._lignes[parseInt(this.dataset.idx)].quantite = parseInt(this.value) || 1; });
    });
    container.querySelectorAll('.btn-rm-besoin-line').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(this.dataset.idx);
        if (self._lignes.length <= 1) { UI.toast('Il faut au moins un article.', 'warning'); return; }
        self._lignes.splice(idx, 1);
        self._refreshLignes();
      });
    });
  },

  _save: function(modal) {
    var self = this;
    var articles = [];
    for (var i = 0; i < self._lignes.length; i++) {
      var l = self._lignes[i];
      if (!l.article_id) { UI.toast('Selectionnez un article pour chaque ligne.', 'error'); return; }
      articles.push({ article_id: parseInt(l.article_id), quantite: l.quantite || 1 });
    }

    var notes = document.getElementById('besoin-notes').value.trim() || null;
    API.createFicheBesoin({ notes: notes, articles: articles })
      .then(function(data) {
        UI.toast('Fiche de besoin creee : ' + data.fiche.reference, 'success');
        modal.close();
        self._load();
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  }
};
```

- [ ] **Step 2: Register the page in `app.js`**

In `public/js/app.js`, add a nav entry to `ALL_ITEMS` (after the `retours` entry, around line 15):
```js
    { id: 'fiches_besoin', label: 'Fiches de besoin', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6"/><path d="M9 16h6"/><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
```

Add `'fiches_besoin'` to the `opIds` array (around line 60):
```js
    var opIds = ['retours', 'fiches_besoin', 'souches', 'billets', 'comptage'];
```

Add a quick action to `QUICK_ACTIONS` (around line 33, after `Nouveau retour`):
```js
    { label: 'Nouvelle fiche de besoin', page: 'fiches_besoin', open: true },
```

Add to `QUICK_OPEN` (around line 43):
```js
  var QUICK_OPEN = { entrees: '_showForm', fiches: '_showEnvoiForm', retours: '_showForm', comptage: '_showForm', fiches_besoin: '_showForm' };
```

Add to the `pagesMap` inside `firePending` (around line 238-243):
```js
    var pagesMap = {
      entrees: typeof Entrees !== 'undefined' ? Entrees : null,
      fiches: typeof Fiches !== 'undefined' ? Fiches : null,
      retours: typeof Retours !== 'undefined' ? Retours : null,
      comptage: typeof Inventaire !== 'undefined' ? Inventaire : null,
      fiches_besoin: typeof FichesBesoin !== 'undefined' ? FichesBesoin : null
    };
```

Add to the `pages` map inside `renderPage` (around line 254-268, after `retours:`):
```js
      fiches_besoin: typeof FichesBesoin !== 'undefined' ? FichesBesoin : null,
```

- [ ] **Step 3: Add the script tag**

In `public/index.html`, right after `<script src="/js/retours.js"></script>` (line 108), add:
```html
  <script src="/js/fiches_besoin.js"></script>
```

- [ ] **Step 4: Syntax-check and manual UI smoke test**

```bash
node --check public/js/fiches_besoin.js
node --check public/js/app.js
```
Expected: no output from either.

Start the app against the disposable test db, open it in a browser, and exercise the page manually (this is a frontend page — no automated DOM test framework exists in this repo, so this is a manual pass, consistent with how the rest of the app is verified):
```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
```
Open `http://localhost:3099` in a browser, log in as `admin`/`admin123`, navigate to "Fiches de besoin" (drawer, section Operations), create a fiche with one article, confirm it appears with badge "Creee", click "Transmettre" (badge becomes "Transmise"), click "Scanner le retour" and upload any image/PDF (badge becomes "Revenue"), click "Archiver" (badge becomes "Archivee"). Confirm no console errors (browser dev tools).

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 5: Commit**

```bash
git add public/js/fiches_besoin.js public/js/app.js public/index.html
git commit -m "feat: page fiches de besoin + navigation"
```

---

### Task 10: Frontend — Entrées : N° fiche de besoin + génération du bon de livraison

**Files:**
- Modify: `public/js/entrees.js`

**Interfaces:**
- Consumes: `API.genererBonLivraison`, `API.getEntreePdfUrl` (Task 8).

- [ ] **Step 1: Add the "N° fiche de besoin" input to the creation form**

In `public/js/entrees.js`, `_showForm` (around line 134-135), change:
```js
        '<div class="form-row"><div class="form-group"><label class="form-label">N° bon de livraison</label><input type="text" class="form-input" id="entree-bl" placeholder="Ex: BL-2026-001"></div>' +
        '<div class="form-group"><label class="form-label">N° facture</label><input type="text" class="form-input" id="entree-facture" placeholder="Ex: FAC-2026-001"></div></div>' +
```
to:
```js
        '<div class="form-row"><div class="form-group"><label class="form-label">N° bon de livraison</label><input type="text" class="form-input" id="entree-bl" placeholder="Ex: BL-2026-001"></div>' +
        '<div class="form-group"><label class="form-label">N° facture</label><input type="text" class="form-input" id="entree-facture" placeholder="Ex: FAC-2026-001"></div></div>' +
        '<div class="form-group"><label class="form-label">N° fiche de besoin (optionnel)</label><input type="text" class="form-input" id="entree-fb" placeholder="Ex: FB-2608-001"></div>' +
```

- [ ] **Step 2: Send `numero_fiche_besoin` when the draft is created**

In `_pickPhoto` (around line 362-368), change:
```js
      var fourn = self._fournAC ? self._fournAC.value() : null;
      var blInput = document.getElementById('entree-bl');
      var factInput = document.getElementById('entree-facture');
      var numeroBL = blInput ? blInput.value.trim() || null : null;
      var numeroFact = factInput ? factInput.value.trim() || null : null;

      API.createEntree({ fournisseur_id: fourn ? fourn.id : null, numero_bl: numeroBL, numero_facture: numeroFact, articles: arts })
```
to:
```js
      var fourn = self._fournAC ? self._fournAC.value() : null;
      var blInput = document.getElementById('entree-bl');
      var factInput = document.getElementById('entree-facture');
      var fbInput = document.getElementById('entree-fb');
      var numeroBL = blInput ? blInput.value.trim() || null : null;
      var numeroFact = factInput ? factInput.value.trim() || null : null;
      var numeroFB = fbInput ? fbInput.value.trim() || null : null;

      API.createEntree({ fournisseur_id: fourn ? fourn.id : null, numero_bl: numeroBL, numero_facture: numeroFact, numero_fiche_besoin: numeroFB, articles: arts })
```

Also add a "Générer" fallback path: since the draft can also be created by clicking "Générer le bon de livraison" *before* any photo is taken (Step 3 below reuses this same article-validation + draft-creation block), extract it into a small helper right above `_pickPhoto` (around line 327):

```js
  // Cree le brouillon d'entree a partir du formulaire courant (partage par _pickPhoto et
  // _genererBonLivraison — les deux peuvent etre le premier declencheur de la creation).
  _ensureDraft: function(cb) {
    var self = this;
    if (self._draftId) { cb(self._draftId); return; }

    var arts = [];
    for (var i = 0; i < self._lignes.length; i++) {
      var l = self._lignes[i];
      if (!l.article_id) { UI.toast('Ajoutez d\'abord les articles.', 'error'); return; }
      arts.push({ article_id: parseInt(l.article_id), quantite: l.quantite || 1, numero_debut: l.numero_debut || null, numero_fin: l.numero_fin || null });
    }
    if (!arts.length) { UI.toast('Ajoutez d\'abord les articles.', 'error'); return; }

    var fourn = self._fournAC ? self._fournAC.value() : null;
    var blInput = document.getElementById('entree-bl');
    var factInput = document.getElementById('entree-facture');
    var fbInput = document.getElementById('entree-fb');
    var numeroBL = blInput ? blInput.value.trim() || null : null;
    var numeroFact = factInput ? factInput.value.trim() || null : null;
    var numeroFB = fbInput ? fbInput.value.trim() || null : null;

    API.createEntree({ fournisseur_id: fourn ? fourn.id : null, numero_bl: numeroBL, numero_facture: numeroFact, numero_fiche_besoin: numeroFB, articles: arts })
      .then(function(data) {
        self._draftId = data.fiche.id;
        self._draftRef = data.fiche.reference;
        cb(self._draftId);
      })
      .catch(function(err) { UI.toast(err.message, 'error'); });
  },
```

Then simplify `_pickPhoto`'s draft-creation branch (the part after `// Sinon : verifier les articles puis creer le brouillon`, lines ~353-374) to reuse it:
```js
      // Brouillon deja cree (reprise ou 2e photo) : uploader directement
      if (self._draftId) { doUpload(self._draftId); return; }

      // Sinon : creer le brouillon (partage avec le bouton « Generer le bon de livraison »)
      self._ensureDraft(function(id) { doUpload(id); });
    });
  },
```
(this replaces the previous inline article-validation + `API.createEntree(...)` block that duplicated what `_ensureDraft` now does).

- [ ] **Step 3: Add the "Générer le bon de livraison" button next to "Prendre une photo"**

In `_showForm` (around line 140-149), change the BL block:
```js
        '<div style="flex:1;min-width:140px;border:1px dashed var(--color-border);border-radius:10px;padding:10px;text-align:center">' +
        '<strong class="text-sm">Bon de livraison</strong>' +
        '<div id="preview-bl" style="margin:8px 0"><span class="text-muted text-sm">Aucune photo</span></div>' +
        '<button class="btn btn-sm btn-secondary" id="btn-photo-bl">Prendre une photo</button>' +
        '</div>' +
```
to:
```js
        '<div style="flex:1;min-width:140px;border:1px dashed var(--color-border);border-radius:10px;padding:10px;text-align:center">' +
        '<strong class="text-sm">Bon de livraison</strong>' +
        '<div id="preview-bl" style="margin:8px 0"><span class="text-muted text-sm">Aucune photo</span></div>' +
        '<button class="btn btn-sm btn-secondary" id="btn-photo-bl">Prendre une photo</button>' +
        '<div class="text-sm text-muted" style="margin:4px 0">— ou, si le fournisseur n\'en a pas fourni —</div>' +
        '<button class="btn btn-sm btn-accent" id="btn-generer-bl" style="background:var(--color-accent);color:#fff">Generer le bon de livraison</button>' +
        '</div>' +
```

Bind the new button right after the existing `btn-photo-bl`/`btn-photo-facture` listeners (around line 156-158):
```js
      document.getElementById('btn-photo-bl').addEventListener('click', function() { self._pickPhoto('bl', 'Bon de livraison'); });
      document.getElementById('btn-photo-facture').addEventListener('click', function() { self._pickPhoto('facture', 'Facture'); });
      document.getElementById('btn-generer-bl').addEventListener('click', function() { self._genererBonLivraison(); });
      self._refreshValiderBtn();
```

- [ ] **Step 4: Implement `_genererBonLivraison` and mark the BL requirement satisfied**

Add this method near `_pickPhoto` (after it, before `_refreshValiderBtn`):
```js
  _genererBonLivraison: function() {
    var self = this;
    self._ensureDraft(function(id) {
      API.genererBonLivraison(id).then(function(data) {
        if (data && data.error) { UI.toast(data.error, 'error'); return; }
        self._photosDone.bl = true;
        var preview = document.getElementById('preview-bl');
        if (preview) {
          preview.innerHTML = '<span class="badge badge-success">Genere</span><br>' +
            '<a href="' + UI.escapeHtml(API.getEntreePdfUrl(id)) + '" target="_blank" class="text-sm">Voir le PDF</a>';
        }
        self._refreshValiderBtn();
        UI.toast('Bon de livraison genere.', 'success');
      }).catch(function(err) { UI.toast(err.message, 'error'); });
    });
  },
```

- [ ] **Step 5: Same button in `_continueDraft` (resuming a draft)**

In `_continueDraft` (around line 405-409), change the BL block the same way:
```js
        '<div style="flex:1;min-width:140px;border:1px dashed var(--color-border);border-radius:10px;padding:10px;text-align:center">' +
        '<strong class="text-sm">Bon de livraison</strong>' +
        '<div id="preview-bl" style="margin:8px 0">' + (hasBL ? '<span class="badge badge-success">Photo BL présente</span>' : '<span class="text-muted text-sm">Aucune photo</span>') + '</div>' +
        '<button class="btn btn-sm btn-secondary" id="btn-photo-bl">' + (hasBL ? 'Remplacer' : 'Prendre une photo') + '</button>' +
        '<div class="text-sm text-muted" style="margin:4px 0">— ou —</div>' +
        '<button class="btn btn-sm btn-accent" id="btn-generer-bl" style="background:var(--color-accent);color:#fff">Generer le bon de livraison</button>' +
        '</div>' +
```

And fetch `f.fichier_path` to seed `self._photosDone.bl` correctly — change the line:
```js
      var hasBL = (data.photos || []).some(function(p) { return p.type === 'bl'; });
```
to:
```js
      var hasBL = (data.photos || []).some(function(p) { return p.type === 'bl'; }) || !!f.fichier_path;
```

Bind the button after the existing two listeners in `_continueDraft` (around line 421-422):
```js
      document.getElementById('btn-photo-bl').addEventListener('click', function() { self._pickPhoto('bl', 'Bon de livraison'); });
      document.getElementById('btn-photo-facture').addEventListener('click', function() { self._pickPhoto('facture', 'Facture'); });
      document.getElementById('btn-generer-bl').addEventListener('click', function() { self._genererBonLivraison(); });
      self._refreshValiderBtn();
```

- [ ] **Step 6: Syntax-check and manual smoke test**

```bash
node --check public/js/entrees.js
```
Expected: no output.

```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
```
Open `http://localhost:3099`, log in `admin`/`admin123`, create an article, go to Entrées → Nouvelle entrée: fill fournisseur, N° fiche de besoin, add an article line, click "Générer le bon de livraison" (a link "Voir le PDF" should appear), take a photo for "Facture" (camera unavailable on desktop — use `UI.pickFile`-style fallback if present, otherwise verify via the "Continuer" flow from the table after closing without a facture photo), confirm the "Valider" button is still disabled until both BL (now generated) and facture are satisfied.

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 7: Commit**

```bash
git add public/js/entrees.js
git commit -m "feat: entrees — generation du bon de livraison et N° fiche de besoin (frontend)"
```

---

### Task 11: Frontend — Grand livre page (remplace la vue stock/valeur)

**Files:**
- Create: `public/js/grandlivre.js`
- Delete: `public/js/inventaire_stock.js`
- Modify: `public/js/app.js:264` (pages map), `public/index.html:112` (script tag swap)

**Interfaces:**
- Consumes: `API.getArticles` (for the filter dropdown), `API.getJournal`, `API.getJournalExportUrl` (Task 8).
- Produces: global `GrandLivre` object with `.render(container)`.

- [ ] **Step 1: Write `public/js/grandlivre.js`**

```js
// public/js/grandlivre.js — Grand livre chronologique (date/heure, article, entree, sortie, stock reel)
var GrandLivre = {
  render: function(container) {
    container.innerHTML =
      '<div class="card">' +
      '<div class="card-header flex-between">' +
      '<h3 class="card-title">Grand livre</h3>' +
      '<a id="btn-export-journal" class="btn btn-secondary btn-sm" href="#">Exporter (Excel)</a>' +
      '</div>' +
      '<div class="filter-bar">' +
      '<select class="form-select" id="journal-article"><option value="">Tous les articles</option></select>' +
      '<input type="date" class="form-input" id="journal-debut">' +
      '<input type="date" class="form-input" id="journal-fin">' +
      '<button class="btn btn-secondary btn-sm" id="btn-journal-refresh">Filtrer</button>' +
      '</div>' +
      '<p class="text-sm text-muted mb-md">Historique chronologique de tous les mouvements, avec le stock reel apres chaque operation (comme un releve).</p>' +
      '<div id="journal-table">' + UI.renderSkeleton(8) + '</div>' +
      '</div>';

    this._loadArticles();
    this._load();
    this._bindEvents();
  },

  _bindEvents: function() {
    var self = this;
    document.getElementById('journal-article').addEventListener('change', function() { self._load(); });
    document.getElementById('btn-journal-refresh').addEventListener('click', function() { self._load(); });
    document.getElementById('btn-export-journal').addEventListener('click', function(e) {
      e.preventDefault();
      window.open(self._currentExportUrl(), '_blank');
    });
  },

  _loadArticles: function() {
    API.getArticles().then(function(data) {
      var sel = document.getElementById('journal-article');
      for (var i = 0; i < data.articles.length; i++) {
        var opt = document.createElement('option');
        opt.value = data.articles[i].id;
        opt.textContent = data.articles[i].nom;
        sel.appendChild(opt);
      }
    }).catch(function() {});
  },

  _currentParams: function() {
    var params = {};
    var art = document.getElementById('journal-article').value;
    var debut = document.getElementById('journal-debut').value;
    var fin = document.getElementById('journal-fin').value;
    if (art) params.article_id = art;
    if (debut) params.debut = debut;
    if (fin) params.fin = fin;
    return params;
  },

  _currentExportUrl: function() {
    return API.getJournalExportUrl(this._currentParams());
  },

  _load: function() {
    var self = this;
    API.getJournal(this._currentParams()).then(function(data) { self._renderTable(data.lignes); })
      .catch(function(err) {
        document.getElementById('journal-table').innerHTML = '<div class="empty-state"><p>' + UI.escapeHtml(err.message) + '</p></div>';
      });
  },

  _renderTable: function(lignes) {
    var el = document.getElementById('journal-table');
    if (!lignes || !lignes.length) { el.innerHTML = UI.renderEmptyState('Aucun mouvement sur cette periode'); return; }

    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date/heure</th><th>Article</th><th>Entree</th><th>Sortie</th><th>Stock reel</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < lignes.length; i++) {
      var l = lignes[i];
      html += '<tr>' +
        '<td>' + UI.formatDate(l.date) + '</td>' +
        '<td>' + UI.escapeHtml(l.article_nom || '-') + '</td>' +
        '<td>' + (l.entree ? '<span class="text-success">+' + l.entree + '</span>' : '-') + '</td>' +
        '<td>' + (l.sortie ? '<span class="text-danger">-' + l.sortie + '</span>' : '-') + '</td>' +
        '<td><strong>' + l.stock_reel + '</strong> ' + UI.escapeHtml(UI.uniteLabel(l.unite)) + '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }
};
```

- [ ] **Step 2: Delete the superseded module**

```bash
rm public/js/inventaire_stock.js
```

- [ ] **Step 3: Swap the script tag in `index.html`**

In `public/index.html`, change line 112:
```html
  <script src="/js/inventaire_stock.js"></script>
```
to:
```html
  <script src="/js/grandlivre.js"></script>
```

- [ ] **Step 4: Repoint the `inventaire` nav entry to `GrandLivre` in `app.js`**

In `public/js/app.js`, `renderPage`'s `pages` map (line 264), change:
```js
      inventaire: typeof InventaireStock !== 'undefined' ? InventaireStock : null,
```
to:
```js
      inventaire: typeof GrandLivre !== 'undefined' ? GrandLivre : null,
```

- [ ] **Step 5: Syntax-check and manual smoke test**

```bash
node --check public/js/grandlivre.js
node --check public/js/app.js
grep -rn "InventaireStock" public/js/ public/index.html
```
Expected: `node --check` produces no output for either file; the `grep` finds **no** remaining references to `InventaireStock` (confirms the old module is fully removed, not just unlinked).

```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
```
Open `http://localhost:3099`, log in, create an article and a few mouvements (via Mouvements page or the API as in Task 6's curl script), navigate to "Inventaire" in the nav — confirm it now shows the grand livre table (Date/heure, Article, Entree, Sortie, Stock reel) instead of the old stock/value grid, that filtering by article/date works, and that clicking "Exporter (Excel)" downloads a file.

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 6: Commit**

```bash
git add public/js/grandlivre.js public/js/app.js public/index.html
git rm public/js/inventaire_stock.js
git commit -m "feat: page Inventaire devient le grand livre chronologique"
```

---

### Task 12: Frontend — Anomalies d'import dans Paramètres

**Files:**
- Modify: `public/js/parametres.js`

**Interfaces:**
- Consumes: `API.getAnomalies`, `API.corrigerNumeroMouvement` (Task 8).

- [ ] **Step 1: Add the admin-only card to `render`**

In `public/js/parametres.js`, `render` (around line 25-30), insert a new card right after the "Importer des données" block and before "Sauvegarde de la base":

```js
      // Anomalies d'import (admin only)
      (isAdmin ? '<div class="card"><div class="card-header"><h3 class="card-title">Anomalies d\'import</h3></div>' +
      '<p class="text-sm text-muted mb-sm">Mouvements de billets/carnets importes sans numero de souche valide — a corriger manuellement.</p>' +
      '<div id="anomalies-list">' + UI.renderSkeleton(3) + '</div></div>' : '') +
```

- [ ] **Step 2: Load and render, wire into existing `if (isAdmin)` block**

In `render`, in the `if (isAdmin) { ... }` block (around line 50-55), add:
```js
    if (isAdmin) {
      this._loadCategories();
      this._loadLocalites();
      this._loadUsers();
      this._loadAuditLog();
      this._loadAnomalies();
    }
```

Add the loader method (place it near `_loadCategories`, following the same style):
```js
  // === Anomalies d'import ===
  _loadAnomalies: function() {
    var self = this;
    API.getAnomalies()
      .then(function(data) { self._renderAnomalies(data.anomalies); })
      .catch(function(err) {
        var el = document.getElementById('anomalies-list');
        if (el) el.innerHTML = '<p class="text-muted text-center">' + UI.escapeHtml(err.message) + '</p>';
      });
  },

  _renderAnomalies: function(anomalies) {
    var el = document.getElementById('anomalies-list');
    if (!el) return;
    if (!anomalies.length) { el.innerHTML = '<p class="text-muted text-center">Aucune anomalie.</p>'; return; }

    var self = this;
    var html = '<div class="table-wrapper"><table><thead><tr>' +
      '<th>Date</th><th>Article</th><th>Type</th><th>Qte</th><th>Localite</th><th>Correction</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < anomalies.length; i++) {
      var a = anomalies[i];
      html += '<tr>' +
        '<td>' + UI.formatDate(a.date) + '</td>' +
        '<td>' + UI.escapeHtml(a.article_nom || '-') + '</td>' +
        '<td>' + (a.type === 'entree' ? 'Entree' : 'Sortie') + '</td>' +
        '<td>' + a.quantite + '</td>' +
        '<td>' + UI.escapeHtml(a.localite_nom || '-') + '</td>' +
        '<td style="display:flex;gap:6px;align-items:center">' +
        '<input type="text" class="form-input anomalie-debut" data-id="' + a.id + '" placeholder="N° debut" style="width:100px;min-height:36px">' +
        '<input type="text" class="form-input anomalie-fin" data-id="' + a.id + '" placeholder="N° fin" style="width:100px;min-height:36px">' +
        '<button class="btn btn-sm btn-primary btn-corriger-anomalie" data-id="' + a.id + '">Corriger</button>' +
        '</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    el.querySelectorAll('.btn-corriger-anomalie').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = this.dataset.id;
        var debut = el.querySelector('.anomalie-debut[data-id="' + id + '"]').value.trim();
        var fin = el.querySelector('.anomalie-fin[data-id="' + id + '"]').value.trim();
        if (!debut || !fin) { UI.toast('N° debut et N° fin requis.', 'error'); return; }
        API.corrigerNumeroMouvement(id, debut, fin)
          .then(function() { UI.toast('Anomalie corrigee.', 'success'); self._loadAnomalies(); })
          .catch(function(err) { UI.toast(err.message, 'error'); });
      });
    });
  },
```

- [ ] **Step 3: Syntax-check and manual smoke test**

```bash
node --check public/js/parametres.js
```
Expected: no output.

```bash
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads && mkdir -p /tmp/nizar-test-uploads
node -e "require('./database/init')('/tmp/nizar-test.db')"
DB_PATH=/tmp/nizar-test.db UPLOAD_DIR=/tmp/nizar-test-uploads GH_BACKUP_REPO= GH_BACKUP_TOKEN= PORT=3099 node server.js &
sleep 2
```
Seed one anomaly (reuse the Task 7 Step 4 approach: create a `numerote` article via UI, then insert a numero-less mouvement via `node -e "require('better-sqlite3')('/tmp/nizar-test.db')..."`), open the app, log in as admin, go to Paramètres, confirm the "Anomalies d'import" card lists it, fill N° début/fin, click "Corriger", confirm the row disappears after reload.

Stop and clean up:
```bash
kill %1
rm -f /tmp/nizar-test.db && rm -rf /tmp/nizar-test-uploads
```

- [ ] **Step 4: Commit**

```bash
git add public/js/parametres.js
git commit -m "feat: section anomalies d'import dans Parametres (admin)"
```

---

## Self-Review Notes

- **Spec coverage:** §2 Fiche de besoin → Tasks 1, 5, 8, 9. §3 Bon de livraison → Tasks 1, 2, 3, 8, 10. §4 Garde-fou stock → Task 4. §5 Grand livre → Tasks 6, 8, 11. §6 Anomalies d'import → Task 7, 8, 12. §9 (rôles) is enforced inline (`requireAdmin` on anomalies routes and fiche-besoin delete, no special gate elsewhere per the spec's table). §6.3 (ré-import) is explicitly out of scope for this plan, per the spec.
- **Type/name consistency check:** `numero_fiche_besoin` used identically in DB column (Task 1), route destructure/insert (Task 3), PDF field (Task 2), and frontend field id `entree-fb` (Task 10) — no drift. `fiches_besoin`/`fiche_besoin_articles` table and column names match across Tasks 1 and 5. `API.genererBonLivraison`/`API.getEntreePdfUrl` names match between Task 8 (definition) and Task 10 (usage). `GrandLivre` object name matches between Task 11's file and its `app.js` registration.
