# Nizar Stock — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Application web full-stack PWA de gestion de stock pour Nizar Transport Voyageur.

**Architecture:** Backend Node.js/Express + SQLite, frontend vanilla HTML/CSS/JS SPA, auth JWT, PWA installable, déploiement Render.

**Tech Stack:** Node.js 20+, Express 4, better-sqlite3, bcryptjs, jsonwebtoken, exceljs, cors, Lucide Icons (CDN), Fira Sans + Fira Code (Google Fonts)

## Global Constraints

- Séparation stricte HTML/CSS/JS/backend, jamais de monofichier
- Mobile-first CSS, breakpoints 768px et 1024px
- PWA : manifest.json + service worker + installable
- Touch targets >= 44x44px, espacement >= 8px
- Contraste texte >= 4.5:1, focus states visibles
- Animations 150-300ms, respecter prefers-reduced-motion
- Toast notifications 3-5s auto-dismiss
- Confirmation avant action destructive
- Pas d'emoji comme icônes (utiliser Lucide Icons SVG inline)
- Aucune mention Claude/IA dans le code, commits ou métadonnées
- Pas de React/Vue/Svelte — vanilla JS uniquement
- Assistant = pas de suppression ni gestion comptes
- Messages de commit en conventional-commit, en français

---

## Phase 1: Fondations backend

### Task 1: Package.json, .gitignore et dépendances

**Files:** Create `package.json`, `.gitignore`

**Action:** Initialiser npm, installer express better-sqlite3 bcryptjs jsonwebtoken exceljs cors, configurer scripts start/dev/db:init, créer .gitignore (node_modules, *.db, .env, .DS_Store).

**Commit:** `chore: initialiser le projet Nizar Stock`

---

### Task 2: Base de données — schéma et seed

**Files:** Create `database/init.js`

**Contenu:** Fonction `initDB(dbPath)` qui:
- Crée toutes les tables selon le modèle de données de la spec (users, categories, fournisseurs, articles, commandes, commande_articles, mouvements)
- Active WAL mode et foreign_keys
- Seed: comptes admin/admin123 et assistant/assistant123 (bcrypt)
- Seed: 5 catégories par défaut (Papeterie, Cartouches et toners, Fournitures de bureau, Nettoyage, Autre)
- S'exécute en standalone via `if (require.main === module)`

**Vérification:** `node database/init.js` affiche le message de succès, le fichier `database/nizar.db` existe.

**Commit:** `feat: ajouter le schema de base de donnees et les seeds`

---

### Task 3: Middleware d'authentification JWT

**Files:** Create `middleware/auth.js`

**Exports:**
- `authenticate(req, res, next)` — vérifie `Authorization: Bearer <token>`, injecte `req.user`
- `requireAdmin(req, res, next)` — vérifie `req.user.role === 'admin'`
- `JWT_SECRET` — constante utilisée pour sign/verify (process.env.JWT_SECRET || fallback)

**Commit:** `feat: ajouter le middleware d'authentification JWT`

---

### Task 4: Routes auth (login + me)

**Files:** Create `routes/auth.js`

**Endpoints:**
- `POST /api/auth/login` — body `{username, password}`, retourne `{token, user: {id, username, role}}`
- `GET /api/auth/me` — authentifié, retourne `{user}`

**Commit:** `feat: ajouter la route d'authentification`

---

### Task 5: Routes dashboard, articles, categories

**Files:** Create `routes/dashboard.js`, `routes/articles.js`, `routes/categories.js`

**dashboard.js:**
- `GET /api/dashboard` — retourne KPI (totalArticles, alertesStock, mouvementsJour, commandesEnCours) + 10 derniers mouvements + top 5 alertes

**articles.js:**
- `GET /api/articles` — liste avec filtres (?search, ?categorie_id, ?alerte=1), jointures categories et fournisseurs
- `POST /api/articles` — création, vérifie doublon reference
- `GET /api/articles/:id` — détail
- `PUT /api/articles/:id` — mise à jour partielle
- `DELETE /api/articles/:id` — admin only (requireAdmin)

**categories.js:**
- `GET /api/categories` — liste triée par nom
- `POST /api/categories` — admin only, création
- `DELETE /api/categories/:id` — admin only

**Commit:** `feat: ajouter les routes dashboard, articles et categories`

---

### Task 6: Routes mouvements, fournisseurs, commandes

**Files:** Create `routes/mouvements.js`, `routes/fournisseurs.js`, `routes/commandes.js`

**mouvements.js:**
- `GET /api/mouvements` — liste filtrée (?debut, ?fin, ?type, ?article_id), limite 500, avec jointures articles/users/fournisseurs, totals entrées/sorties
- `POST /api/mouvements` — crée mouvement ET met à jour stock_actuel (entree: +quantite, sortie: -quantite), vérifie stock suffisant pour sortie

**fournisseurs.js:**
- `GET /api/fournisseurs` — liste
- `POST /api/fournisseurs` — création
- `GET /api/fournisseurs/:id` — détail avec nb_articles et nb_commandes
- `PUT /api/fournisseurs/:id` — mise à jour
- `DELETE /api/fournisseurs/:id` — admin only

**commandes.js:**
- `GET /api/commandes` — liste avec filtre ?statut, jointure fournisseur, inclut nb_lignes
- `POST /api/commandes` — création (statut initial: brouillon) avec lignes (commande_articles)
- `GET /api/commandes/:id` — détail avec lignes (jointure articles)
- `PUT /api/commandes/:id` — mise à jour (brouillon seulement)
- `PATCH /api/commandes/:id/statut` — change statut, si 'recue': génère mouvements d'entrée pour chaque ligne et met à jour stock
- `DELETE /api/commandes/:id` — admin only, annule si pas déjà reçue

**Commit:** `feat: ajouter les routes mouvements, fournisseurs et commandes`

---

### Task 7: Routes rapports et users

**Files:** Create `routes/rapports.js`, `routes/users.js`

**rapports.js:**
- `GET /api/rapports/stock` — export Excel de tous les articles (colonnes: Référence, Nom, Catégorie, Stock, Stock Min, Prix, Fournisseur) avec couleurs conditionnelles
- `GET /api/rapports/mouvements` — export Excel des mouvements filtrés (?debut, ?fin), avec onglet résumé
- `GET /api/rapports/consommation` — export Excel: consommation par article sur période

**users.js:**
- `GET /api/users` — admin only, liste
- `POST /api/users` — admin only, création avec bcrypt
- `PUT /api/users/:id` — admin only, mise à jour (username, password, role)
- `DELETE /api/users/:id` — admin only, empêche suppression de soi-même

**Commit:** `feat: ajouter les routes rapports et utilisateurs`

---

### Task 8: Serveur principal (server.js)

**Files:** Create `server.js`

**Contenu:**
- Initialise la DB via `initDB()`
- Injecte `req.db` via middleware
- Monte toutes les routes sous `/api/...`
- Sert le dossier `public/` en statique
- Fallback SPA: toutes les routes non-API renvoient `public/index.html`
- Écoute sur `process.env.PORT || 3000`
- CORS activé

**Vérification:** `node server.js` démarre sans erreur, `curl localhost:3000/api/dashboard` retourne 401 (auth requise).

**Commit:** `feat: ajouter le serveur principal Express`

---

## Phase 2: Frontend SPA

### Task 9: Page HTML principale et CSS

**Files:** Create `public/index.html`, `public/css/app.css`

**index.html:**
- Structure SPA: `<div id="app">` avec écran de login, sidebar desktop, bottom nav mobile, zone de contenu (#page-content)
- Chargement Google Fonts (Fira Sans + Fira Code)
- Chargement Lucide Icons (CDN: `lucide.dev/umd/lucide.min.js`)
- Meta viewport, meta theme-color, link manifest.json
- `<script type="module" src="/js/app.js">` — point d'entrée

**app.css:**
- Design tokens CSS custom properties (couleurs du design system)
- Reset + box-sizing: border-box
- Mobile-first: styles de base pour mobile (< 768px)
- Media query >= 768px: sidebar visible, contenu décalé
- Media query >= 1024px: max-width contenu, grilles multi-colonnes
- Composants réutilisables: .card, .btn, .btn-primary, .btn-danger, .btn-sm, .badge, .badge-success/warning/danger, .table-wrapper (overflow-x auto), .form-group, .form-label, .form-input, .modal-overlay, .modal-content, .toast-container, .skeleton, .empty-state, .kpi-grid, .kpi-card
- Mode sombre: `[data-theme="dark"]` avec palette inversée
- Respect prefers-reduced-motion: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`
- Sidebar fixe à gauche (desktop), bottom nav fixe (mobile)
- Safe area padding pour mobile (env(safe-area-inset-bottom))

**Commit:** `feat: ajouter la structure HTML et le CSS du frontend`

---

### Task 10: Core JavaScript — app.js, api.js, ui.js

**Files:** Create `public/js/app.js`, `public/js/api.js`, `public/js/ui.js`

**api.js:**
- Objet `API` avec méthodes: `login(username, password)`, `getMe()`, et pour chaque module (articles, mouvements, fournisseurs, commandes, categories, rapports, users, dashboard) les méthodes CRUD correspondantes
- Gère automatiquement le header Authorization Bearer (token stocké dans localStorage)
- Intercepte les 401 pour rediriger vers login
- Toutes les méthodes retournent des Promises, gèrent le JSON parsing
- `API.fetch(url, options)` comme méthode interne de base

**ui.js:**
- `UI.toast(message, type)` — affiche un toast (success/error/warning/info), auto-dismiss 4s
- `UI.confirm(message)` — retourne une Promise<boolean>, affiche une modale de confirmation
- `UI.modal(title, contentHtml, actions)` — modale générique avec boutons
- `UI.formatDate(isoString)` — formate une date ISO en JJ/MM/AAAA HH:MM
- `UI.renderBadgeStatut(statut)` — badge couleur pour statut commande
- `UI.renderStockBadge(stockActuel, stockMin)` — badge vert/ambre/rouge
- `UI.renderEmptyState(message, actionLabel, actionUrl)` — état vide avec icône et CTA
- `UI.renderSkeleton(rows)` — skeleton loader
- `UI.toggleTheme()` — bascule data-theme sur document.documentElement, sauvegarde localStorage
- `UI.debounce(fn, delay)` — utilitaire debounce
- `UI.escapeHtml(str)` — sanitize

**app.js:**
- Router SPA minimal: écoute hashchange et popstate
- Vérifie le token au chargement, redirige vers login si absent
- Si authentifié: charge la page correspondant au hash (dashboard par défaut)
- Gère la sidebar desktop et la bottom nav mobile
- Affiche le username et le rôle dans la navbar
- Bouton logout, toggle theme
- Fonction `navigate(page)` pour navigation interne
- Chaque page est un module avec une fonction `render(container)` et `init()`

**Commit:** `feat: ajouter le core JavaScript (router, api, ui)`

---

### Task 11: Pages — Dashboard et Articles

**Files:** Create `public/js/dashboard.js`, `public/js/articles.js`

**dashboard.js:**
- Fonction `render(container)`:
  - Affiche 4 KPI cards en grille (Total articles, Alertes stock, Mvts du jour, Commandes en cours) avec icônes Lucide
  - Liste des 10 derniers mouvements (tableau compact)
  - Top 5 alertes (cards cliquables -> lien vers commandes)
- Fonction `init()`: appel API dashboard, rendu, refresh auto toutes les 60s

**articles.js:**
- Fonction `render(container)`:
  - Barre de recherche avec debounce 300ms
  - Select filtre catégorie (chargé depuis API)
  - Checkbox "Alertes uniquement"
  - Bouton "Ajouter un article" (modal avec formulaire complet)
  - Tableau responsive: sur mobile -> card layout, sur desktop -> table
  - Colonnes: Référence, Nom, Catégorie, Stock (badge), Stock min, Prix, Fournisseur, Actions (Entrée rapide, Sortie rapide, Modifier, Supprimer)
  - Actions rapides: mini-modale pour entrée/sortie avec quantité + motif
- Fonction `init()`: chargement liste, binding événements

**Commit:** `feat: ajouter les pages dashboard et articles`

---

### Task 12: Pages — Mouvements et Fournisseurs

**Files:** Create `public/js/mouvements.js`, `public/js/fournisseurs.js`

**mouvements.js:**
- Fonction `render(container)`:
  - Filtres: date début, date fin, type (entrée/sortie/tous), article (select recherche)
  - Résumé: total entrées, total sorties, solde
  - Bouton "Nouveau mouvement" (modal: article, type, quantité, motif, demandeur)
  - Tableau responsive: Date, Article, Type (badge), Qté, Motif, Demandeur, Utilisateur
- Motifs prédéfinis: Distribution au personnel, Périmé/Endommagé, Transfert, Réception commande, Inventaire, Autre

**fournisseurs.js:**
- Fonction `render(container)`:
  - Liste en cards (mobile) / tableau (desktop)
  - Colonnes: Nom, Contact, Téléphone, Email, Délai moyen, Nb articles, Actions
  - Bouton "Ajouter un fournisseur" (modal)
  - Au clic sur un fournisseur -> drawer/expand avec: détails, liste des articles fournis, historique commandes

**Commit:** `feat: ajouter les pages mouvements et fournisseurs`

---

### Task 13: Pages — Commandes, Rapports et Paramètres

**Files:** Create `public/js/commandes.js`, `public/js/rapports.js`, `public/js/parametres.js`

**commandes.js:**
- Fonction `render(container)`:
  - Filtre par statut (tous/brouillon/envoyee/recue/annulee)
  - Liste: N° commande, Fournisseur, Date, Statut (badge), Nb lignes, Total, Actions
  - Bouton "Nouvelle commande":
    1. Sélection fournisseur (select)
    2. Tableau de lignes: article (select avec suggestions si stock bas), quantité, prix unitaire
    3. Bouton "+" ajoute une ligne, icône corbeille supprime
    4. Enregistrer (brouillon)
  - Actions par commande: Modifier (si brouillon), Envoyer, Marquer reçue, Annuler, Exporter bon (ouverture nouvel onglet avec version imprimable)
  - Changement statut -> confirmation -> rechargement

**rapports.js:**
- Fonction `render(container)`:
  - 3 cartes d'export: État du stock, Historique mouvements (avec sélecteurs date), Consommation
  - Chaque carte: description + bouton "Exporter Excel"
  - Appel API -> téléchargement fichier .xlsx

**parametres.js:**
- Fonction `render(container)`:
  - Section "Catégories": liste + ajout/suppression (admin only)
  - Section "Utilisateurs": liste + ajout/modification/suppression (admin only) — champs: username, password (optionnel en modif), role
  - Section "Préférences": changement mot de passe (pour soi-même), toggle thème sombre/clair
  - Chaque section dans une card séparée

**Commit:** `feat: ajouter les pages commandes, rapports et parametres`

---

## Phase 3: PWA et déploiement

### Task 14: PWA — manifest.json, service worker et icônes

**Files:** Create `public/manifest.json`, `public/sw.js`, `public/icons/`

**manifest.json:**
```json
{
  "name": "Nizar Stock",
  "short_name": "NizarStock",
  "description": "Gestion de stock - Nizar Transport Voyageur",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8FAFC",
  "theme_color": "#334155",
  "orientation": "any",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**sw.js:**
- Stratégie cache-first pour CSS/JS/images
- Network-first pour les appels API
- Cache nommé avec version pour invalidation
- Événements install, activate, fetch

**Icônes:**
- Générer icon-192.png et icon-512.png (fond slate-700 avec initiales "NS" en blanc via canvas Node.js ou script simple)

**Commit:** `feat: ajouter le support PWA (manifest, service worker, icones)`

---

### Task 15: Build final, recette et commit

- [ ] **Step 1: Vérifier que le serveur démarre**

```bash
cd /Users/macbookair/Desktop/Nizar && node server.js &
sleep 2
curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | head -c 200
kill %1
```

Attendu: JSON avec token et user.

- [ ] **Step 2: Vérifier les endpoints principaux**

```bash
cd /Users/macbookair/Desktop/Nizar && node server.js &
sleep 2
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).token))")
curl -s http://localhost:3000/api/dashboard -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
curl -s http://localhost:3000/api/categories -H "Authorization: Bearer $TOKEN"
kill %1
```

Attendu: dashboard avec KPI, categories avec les 5 catégories seed.

- [ ] **Step 3: Vérifier le frontend**

Ouvrir `http://localhost:3000` dans le navigateur, vérifier:
- Page login affichée
- Connexion admin/admin123 fonctionnelle
- Dashboard avec KPI visibles
- Navigation entre tous les onglets fonctionnelle
- Mode responsive (mobile + desktop)
- PWA installable (vérifier manifest.json accessible)

- [ ] **Step 4: Commit final**

```bash
cd /Users/macbookair/Desktop/Nizar && git add -A && git commit -m "feat: application complete Nizar Stock v1.0.0"
```

---

## Fichiers créés — récapitulatif

```
nizar-stock/
├── server.js
├── package.json
├── .gitignore
├── database/
│   └── init.js
├── middleware/
│   └── auth.js
├── routes/
│   ├── auth.js
│   ├── dashboard.js
│   ├── articles.js
│   ├── categories.js
│   ├── mouvements.js
│   ├── fournisseurs.js
│   ├── commandes.js
│   ├── rapports.js
│   └── users.js
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   ├── app.js
│   │   ├── api.js
│   │   ├── ui.js
│   │   ├── dashboard.js
│   │   ├── articles.js
│   │   ├── mouvements.js
│   │   ├── fournisseurs.js
│   │   ├── commandes.js
│   │   ├── rapports.js
│   │   └── parametres.js
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-07-30-nizar-stock-design.md
        └── plans/
            └── 2026-07-30-nizar-stock-plan.md
```

**Total: 23 fichiers à créer**
