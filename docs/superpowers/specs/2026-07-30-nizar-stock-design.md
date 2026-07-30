# Spécification — Nizar Stock (Gestion de Stock Nizar Transport Voyageur)

**Date :** 2026-07-30  
**Produit :** Application web PWA de gestion de stock pour agent de transport  
**Commande :** Agent gestionnaire de stock + 1 assistant

---

## 1. Résumé

Application web full-stack hébergée (approche cloud) permettant à un gestionnaire de stock de Nizar Transport Voyageur de gérer son catalogue de fournitures bureautiques : réception, distribution, commandes fournisseurs, inventaires et rapports. Deux comptes utilisateurs (admin + assistant), accessible depuis PC et mobile (PWA).

---

## 2. Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Frontend | HTML/CSS/JS vanilla — PWA | Simple, rapide, installable sur mobile comme une app native, zéro dépendance lourde |
| Backend | Node.js + Express | Léger, écosystème riche, simple à déployer |
| Base de données | SQLite (better-sqlite3) | Un seul fichier, pas de serveur DB à gérer, suffisant pour le volume (100-500 articles) |
| Authentification | JWT (JSON Web Token) | Stateless, pas de session serveur, compatible mobile |
| Déploiement | Render (gratuit) | HTTPS automatique, persistance disque, zéro maintenance infra |
| Icônes | Lucide Icons | SVG légères, cohérentes |

---

## 3. Design System (UI/UX Pro Max)

### 3.1 Style

**Data-Dense Dashboard** — professionnel, efficace, optimisé pour afficher beaucoup d'informations sans perdre en lisibilité. Mode clair et sombre complets.

### 3.2 Palette

| Rôle | Hex | CSS Variable |
|------|-----|--------------|
| Fond | `#F8FAFC` | `--color-background` |
| Texte | `#0F172A` | `--color-foreground` |
| Primaire | `#334155` | `--color-primary` |
| Accent / CTA | `#059669` | `--color-accent` |
| Surfaces | `#FFFFFF` | `--color-surface` |
| Bordures | `#E6E8EA` | `--color-border` |
| Destructif | `#DC2626` | `--color-destructive` |
| Statut OK | `#16A34A` | `--color-success` |
| Statut Warning | `#F59E0B` | `--color-warning` |
| Statut Alerte | `#DC2626` | `--color-danger` |

### 3.3 Typographie

- **Titres :** Fira Code (400, 500, 600, 700)
- **Corps :** Fira Sans (300, 400, 500, 600, 700)
- **Échelle :** 12 / 14 / 16 / 18 / 24 / 32px
- **Line-height corps :** 1.5
- **Line-height titres :** 1.25

### 3.4 Règles UX critiques

- Touch targets ≥ 44×44px
- Espacement minimum 8px entre cibles tactiles
- Focus states visibles (2-4px ring)
- Contraste texte ≥ 4.5:1
- Animations 150-300ms, respecter `prefers-reduced-motion`
- Toast notifications (3-5s auto-dismiss)
- États vides avec message + action
- Skeleton loaders au chargement (>300ms)
- Confirmation avant toute action destructive
- Labels visibles sur tous les champs (pas placeholder-only)

---

## 4. Architecture

```
┌─────────────────────────────────────────┐
│              NAVIGATEUR (PWA)            │
│  ┌───────────┐  ┌────────────────────┐  │
│  │  Mobile    │  │  Desktop           │  │
│  │  < 768px   │  │  ≥ 1024px          │  │
│  │  Bottom Nav│  │  Sidebar gauche    │  │
│  └───────────┘  └────────────────────┘  │
└──────────────────┬──────────────────────┘
                   │  API REST (JSON)
┌──────────────────▼──────────────────────┐
│         BACKEND Node.js + Express        │
│  ┌─────────┐ ┌────────┐ ┌───────────┐  │
│  │  Auth   │ │  Stock │ │ Rapports  │  │
│  │  JWT    │ │  CRUD  │ │  Excel    │  │
│  └─────────┘ └────────┘ └───────────┘  │
├─────────────────────────────────────────┤
│            SQLite (1 fichier)           │
└─────────────────────────────────────────┘
```

---

## 5. Modèle de données

### 5.1 Tables

**users**
| Colonne | Type | Contrainte |
|---------|------|------------|
| id | INTEGER | PK |
| username | TEXT | UNIQUE |
| password | TEXT | bcrypt hash |
| role | TEXT | 'admin' \| 'assistant' |
| created_at | TEXT | ISO datetime |

**categories**
| Colonne | Type | Contrainte |
|---------|------|------------|
| id | INTEGER | PK |
| name | TEXT | UNIQUE |
| description | TEXT | |
| created_at | TEXT | ISO datetime |

**fournisseurs**
| Colonne | Type | Contrainte |
|---------|------|------------|
| id | INTEGER | PK |
| nom | TEXT | |
| contact | TEXT | |
| telephone | TEXT | |
| email | TEXT | |
| adresse | TEXT | |
| delai_moyen_j | INTEGER | |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | ISO datetime |

**articles**
| Colonne | Type | Contrainte |
|---------|------|------------|
| id | INTEGER | PK |
| reference | TEXT | UNIQUE |
| nom | TEXT | |
| categorie_id | INTEGER | FK → categories.id |
| description | TEXT | |
| unite | TEXT | (pièce, carton, ramette...) |
| stock_min | INTEGER | seuil d'alerte |
| stock_actuel | INTEGER | calculé |
| prix_unitaire | REAL | |
| fournisseur_id | INTEGER | FK → fournisseurs.id |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | ISO datetime |

**mouvements**
| Colonne | Type | Contrainte |
|---------|------|------------|
| id | INTEGER | PK |
| article_id | INTEGER | FK → articles.id |
| type | TEXT | 'entree' \| 'sortie' |
| quantite | INTEGER | |
| motif | TEXT | |
| demandeur | TEXT | (pour les sorties) |
| user_id | INTEGER | FK → users.id |
| fournisseur_id | INTEGER | FK → fournisseurs.id (nullable) |
| commande_id | INTEGER | FK → commandes.id (nullable) |
| date | TEXT | ISO datetime |
| created_at | TEXT | ISO datetime |

**commandes**
| Colonne | Type | Contrainte |
|---------|------|------------|
| id | INTEGER | PK |
| fournisseur_id | INTEGER | FK → fournisseurs.id |
| statut | TEXT | 'brouillon' \| 'envoyee' \| 'recue' \| 'annulee' |
| date_commande | TEXT | ISO datetime |
| date_reception | TEXT | ISO datetime (nullable) |
| notes | TEXT | |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | ISO datetime |

**commande_articles**
| Colonne | Type | Contrainte |
|---------|------|------------|
| id | INTEGER | PK |
| commande_id | INTEGER | FK → commandes.id |
| article_id | INTEGER | FK → articles.id |
| quantite | INTEGER | |
| prix_unitaire | REAL | |

### 5.2 Règles métier

- **Stock actuel** = SUM(entrees) - SUM(sorties), recalculé à chaque mouvement
- **Alerte** : article dont `stock_actuel ≤ stock_min` → badge rouge sur le dashboard
- **Commande reçue** → génère automatiquement un mouvement d'entrée
- **Motifs de sortie prédéfinis** : Distribution au personnel, Périmé/Endommagé, Transfert, Autre
- **Suppression** : l'assistant ne peut pas supprimer d'enregistrements ni gérer les comptes

---

## 6. Modules fonctionnels (7 onglets)

### 6.1 Tableau de bord
- **KPI cards** : Total articles, Alertes stock bas, Mouvements du jour, Commandes en cours
- **Graphique** : Évolution des mouvements (entrées/sorties) sur 7/30 jours
- **Liste rapide** : Top 5 articles sous le seuil, lien direct vers les commandes

### 6.2 Articles
- Tableau complet : référence, nom, catégorie, stock actuel, stock min, prix, fournisseur
- Recherche textuelle + filtres par catégorie
- Badge couleur par niveau de stock (vert/ambre/rouge)
- CRUD complet (créer, modifier, supprimer un article)
- Actions rapides : enregistrer une entrée/sortie directement depuis l'article

### 6.3 Mouvements
- Historique chronologique inversé (plus récent d'abord)
- Filtres : période (date début → date fin), type (entrée/sortie), article, utilisateur
- Chaque ligne : date, article, type, quantité, motif, demandeur, qui a saisi
- Résumé : total entrées, total sorties, solde sur la période filtrée

### 6.4 Fournisseurs
- Liste des fournisseurs avec contact
- CRUD complet
- Depuis un fournisseur : voir son catalogue, historique des commandes

### 6.5 Commandes
- Liste des commandes avec statut (badge couleur)
- Création de commande :
  - Sélection du fournisseur
  - Suggestions : articles sous le seuil chez ce fournisseur
  - Ajout/suppression de lignes, quantité, prix unitaire
  - Statut initial : « brouillon »
- Actions : envoyer (passe à « envoyée »), marquer comme reçue (passe à « reçue » → génère les entrées en stock), annuler
- Export PDF du bon de commande

### 6.6 Rapports
- État du stock complet (export Excel)
- Historique des mouvements sur période (export Excel)
- Consommation par article/période (export Excel)
- Format : fichier .xlsx avec en-têtes, couleurs, colonnes ajustées

### 6.7 Paramètres
- Gestion des catégories personnalisées
- Gestion des comptes utilisateurs (admin seulement)
- Changement de mot de passe
- Seuils d'alerte par défaut
- Mode clair/sombre

---

## 7. Authentification & Rôles

| Action | Admin | Assistant |
|--------|-------|-----------|
| Voir tout | ✅ | ✅ |
| CRUD articles | ✅ | ✅ |
| CRUD mouvements | ✅ | ✅ |
| CRUD fournisseurs | ✅ | ✅ |
| CRUD commandes | ✅ | ✅ |
| Exports Excel | ✅ | ✅ |
| Supprimer des données | ✅ | ❌ |
| Gérer les comptes | ✅ | ❌ |
| Gérer les catégories | ✅ | ❌ |

---

## 8. Déploiement

- **Plateforme :** Render (https://render.com)
- **Type :** Web Service + Disk (pour persistance SQLite)
- **Build :** `npm install`
- **Start :** `node server.js`
- **Domaine :** fourni par Render (possibilité de custom domain plus tard)

---

## 9. Spécifications techniques

### 9.1 API Endpoints

```
POST   /api/auth/login            → { token }
GET    /api/auth/me               → { user }

GET    /api/dashboard             → { kpi, mouvements_recents, alertes }

GET    /api/articles              → [articles] (+ ?search=&categorie_id=&alerte=1)
POST   /api/articles              → { article }
GET    /api/articles/:id          → { article }
PUT    /api/articles/:id          → { article }
DELETE /api/articles/:id          → (admin only)

GET    /api/mouvements            → [mouvements] (+ ?debut=&fin=&type=&article_id=)
POST   /api/mouvements            → { mouvement }

GET    /api/fournisseurs          → [fournisseurs]
POST   /api/fournisseurs          → { fournisseur }
GET    /api/fournisseurs/:id      → { fournisseur }
PUT    /api/fournisseurs/:id      → { fournisseur }
DELETE /api/fournisseurs/:id      → (admin only)

GET    /api/commandes             → [commandes] (+ ?statut=)
POST   /api/commandes             → { commande }
GET    /api/commandes/:id         → { commande + lignes }
PUT    /api/commandes/:id         → { commande }
PATCH  /api/commandes/:id/statut  → { commande }

GET    /api/categories            → [categories]
POST   /api/categories            → { categorie } (admin only)
DELETE /api/categories/:id        → (admin only)

GET    /api/rapports/stock        → fichier Excel
GET    /api/rapports/mouvements   → fichier Excel
GET    /api/rapports/consommation → fichier Excel

GET    /api/users                 → [users] (admin only)
POST   /api/users                 → { user } (admin only)
PUT    /api/users/:id             → { user } (admin only)
DELETE /api/users/:id             → (admin only)
```

### 9.2 Structure du projet

```
nizar-stock/
├── server.js              # Point d'entrée Express
├── package.json
├── database/
│   ├── init.js            # Création tables + seed admin
│   └── nizar.db           # Fichier SQLite (gitignored)
├── routes/
│   ├── auth.js
│   ├── articles.js
│   ├── mouvements.js
│   ├── fournisseurs.js
│   ├── commandes.js
│   ├── categories.js
│   ├── rapports.js
│   ├── dashboard.js
│   └── users.js
├── middleware/
│   └── auth.js            # JWT verification + role check
├── public/                # Frontend statique
│   ├── index.html
│   ├── manifest.json      # PWA
│   ├── sw.js              # Service Worker
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   ├── app.js         # Router SPA, auth, navigation
│   │   ├── api.js         # Client HTTP
│   │   ├── dashboard.js
│   │   ├── articles.js
│   │   ├── mouvements.js
│   │   ├── fournisseurs.js
│   │   ├── commandes.js
│   │   ├── rapports.js
│   │   ├── parametres.js
│   │   └── ui.js          # Composants UI réutilisables (toast, modal, table, etc.)
│   └── icons/             # Icônes PWA + favicon
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-07-30-nizar-stock-design.md
```

---

## 10. Règles d'implémentation

- **Séparation stricte** : HTML, CSS, JS, backend chacun dans ses fichiers
- **Mobile-first** : styles de base pour mobile, media queries pour tablette/desktop
- **PWA** : manifest.json, service worker, installable, mode hors-ligne basique
- **Accessibilité** : labels, focus, contrastes, aria, pas d'emoji comme icônes
- **Aucune dépendance lourde** : pas de React/Vue/Svelte — vanilla JS avec approche composants légers
- **Pas de mentions Claude/IA** dans le code, les commits ou les métadonnées
