# Spécification — Centre de rapports détaillés Nizar Stock

**Date :** 2026-08-08
**Produit :** Application web PWA de gestion de stock — Nizar Transport Voyageur
**Base existante :** app Nizar Stock (Express + SQLite + SPA vanilla + PWA). Cette spécification décrit une **évolution** du module Rapports : passage d'une page d'exports Excel/PDF à un **centre de rapports** consultable, filtré, graphé et exportable.

---

## 1. Résumé

Le gestionnaire de stock a besoin d'**exploiter toutes les données** pour piloter le stock : comprendre *où* se concentrent valeur et consommation, *suivre* les mouvements par période/article/agence, *anticiper* les ruptures et *auditer* les flux.

Aujourd'hui la page « Rapports » ne propose que **4 exports Excel/PDF** (état du stock, mouvements, consommation, sorties-agence), sans affichage in-app, sans filtres partagés, sans graphiques.

Cette évolution transforme la page Rapports en **centre de rapports** :
- **Filtres et regroupements précis** : période, article, catégorie, agence, fournisseur, type, utilisateur + dimension de regroupement (jour, mois, article, agence, catégorie, fournisseur, type, utilisateur).
- **Rapports de split (les deux sens)** : ventilation d'un total (stock / sorties / valeur) par dimension *et* descente au détail ligne-à-ligne.
- **Visualisation** : graphiques Chart.js (ligne, barres, barres empilées, donut), résumés KPI, tableaux détaillés.
- **Exports soignés** : Excel stylé, CSV, impression navigateur — respectant la charte graphique de l'entreprise.
- **Charte graphique Nizar** : turquoise `#0EA5A0` + noir marque `#111827`, Fira Sans / Fira Code, même design system que le reste de l'app.

---

## 2. Charte graphique & rendu

### 2.1 Palette d'entreprise (tokens déjà en place dans `public/css/app.css`)

| Rôle | Token | Valeur |
|---|---|---|
| Accent principal — turquoise Nizar | `--color-accent` | `#0EA5A0` |
| Turquoise foncé (hover) | `--color-accent-hover` | `#0B8A86` |
| Turquoise clair (fond info) | `--color-info-bg` | `#E6F5F4` |
| Accent secondaire — noir marque | `--color-primary` | `#111827` |
| Texte atténué | `--color-text-muted` | `#6B7280` |
| Succès | `--color-success` | `#16A34A` |
| Alerte | `--color-warning` | `#D97706` |
| Danger / rupture | `--color-danger` | `#DC2626` |
| Surfaces / bordures | `--color-surface`, `--color-border` | `#FFFFFF`, `#E5E7EB` |

Typographie : **Fira Sans** pour le corps, **Fira Code** pour les données et totaux (cohérent avec les tables existantes).

### 2.2 Palette de graphiques (dérivée de la marque)

Sémantique fixe (reprise du widget tendance existant) :
- **Entrées = turquoise `#0EA5A0`**
- **Sorties = noir `#111827`** (marque)
- **Alerte = ambre `#D97706`**, **Rupture = rouge `#DC2626`**, **OK = vert `#16A34A`**

Palette catégorielle pour les ventilations (donut/barres par dimension), dans cet ordre :
`#0EA5A0`, `#111827`, `#D97706`, `#16A34A`, `#0B8A86`, `#6B7280`, `#DC2626`, `#8B5CF6` — puis cycle. Homogène avec la marque, jamais de couleurs étrangères.

### 2.3 Style des cartes, tableaux, boutons

Réutilisation des classes existantes : `.card`, `.badge-*`, `.btn btn-primary`, `.form-input`, `.kpi-card`, `.table-wrapper` + variables CSS. **Aucune couleur « custom »** : tout passe par les tokens. Les nouvelles classes (`report-filters`, `report-chart`, `report-table`, `report-kpis`) ajoutées dans `app.css` ne font référence qu'aux variables existantes.

---

## 3. Architecture backend

### 3.1 Moteur d'agrégation — `services/rapports.js` (nouveau)

Une fonction `aggregateMouvements(db, opts)` et une fonction `aggregateStock(db, opts)` génèrent des requêtes `GROUP BY` à partir d'une **dimension** et de **filtres**, avec liste blanche stricte.

**Dimensions reconnues** (param `group_by`) :
`jour` | `mois` | `article` | `categorie` | `localite` | `fournisseur` | `type` | `utilisateur`

**Métriques** : `quantite` (SUM), `valeur` (SUM quantite × prix_unitaire), `nb` (COUNT), et pour les séries temporelles : `entrees` / `sorties` / `solde`.

**Filtres** (tous validés, liste blanche) :
`debut`, `fin` (dates ISO), `article_id`, `categorie_id`, `localite_id`, `fournisseur_id`, `type` (`entree`|`sortie`), `user_id`, `limit` (top-N), `stock_min_jours` (articles dormants), `jours_couverture`.

**Règle commune :** un paramètre inconnu ou une dimension invalide → `400` avec message clair ; les `id` inexistants → `400` (« Référence introuvable »).

### 3.2 Endpoints — `/api/rapports/v2/:slug`

Chaque rapport = une **config** (dimension par défaut, métriques, filtres autorisés) exprimée dans le routeur. Réponse JSON par défaut : `{ meta, rows, totals }` où `meta` = filtres appliqués + libellés, `rows` = lignes regroupées, `totals` = lignes de total pour KPI.

**Exports** : tous les endpoints acceptent `?format=json|xlsx|csv` :
- `xlsx` : workbook stylé (voir §6.1) généré par un helper `writeWorkbook(res, workbook)`.
- `csv` : flux texte UTF-8 BOM, séparateur `;`, CRLF, en-tête de colonnes.
- `json` : défaut (consommé par l'UI).

Un endpoint **`meta`** expose les listes de référence pour la barre de filtres (lues directement en base, indépendamment des autres routes) : articles, catégories, agences/localités, fournisseurs, utilisateurs. Réponse : `{ articles, categories, localites, fournisseurs, users }`.

Liste des slugs et dimensions par défaut :

| Slug | Source | Dimensions (group_by) | Métriques clés |
|---|---|---|---|
| `meta` | multi-tables | — | articles, categories, localites, fournisseurs, users (pour filtres) |
| `ventilation-stock` | articles | categorie, fournisseur, type, unite | nb articles, stock, valeur, alerte, rupture |
| `mouvements` | mouvements | jour, mois, article, categorie, localite, fournisseur, type, utilisateur | entrees, sorties, solde, valeur |
| `consommation` | mouvements (sorties) | article, mois, localite | quantite, valeur, nb |
| `sorties-agence` | mouvements (sorties) | localite (+ détail localite×article) | quantite, valeur |
| `entrees` | fiches_entree | fournisseur, mois | nb fiches, nb lignes, valeur |
| `commandes` | commandes + commande_articles | fournisseur, statut | nb, delai moyen (j) |
| `retours` | retours_carnets | localite, type, article | quantite, nb |
| `inventaires` | inventaires | article, utilisateur | theorique, compte, ecart |
| `alertes` | articles | categorie, fournisseur | stock, min, valeur en risque |
| `fiches-reception` | fiches_reception | localite, statut, mois | nb fiches, nb lignes |
| `series` | series_numeros + mouvements de sortie | localite | emis, envoyes, retournes usage / non_utilise |
| `dormants` | articles + mouvements | categorie | stock non nul, dernier mouvement |
| `couverture` | articles + mouvements | categorie | jours de couverture |
| `top-valeur` | articles | — | top 10 par valeur de stock |
| `valeur-evolution` | mouvements | mois | valeur entrees / sorties |

Les 4 rapports Excel existants (`/api/rapports/stock`, `mouvements`, `consommation`, `sorties-agence`) sont **conservés** (compatibilité). Le nouveau front n'utilise que `/api/rapports/v2/*`.

---

## 4. Architecture frontend

### 4.1 Chart.js via CDN

- `<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js">` ajouté dans `public/index.html` (avant `app.js`), avec `defer`.
- **Cache PWA** : ajout de l'URL CDN à la liste de cache de `public/sw.js` (stratégie stale-while-revalidate) pour que les graphiques restent disponibles offline une fois chargés.
- **Thème** : `Chart.defaults.font.family` = Fira Sans ; `Chart.defaults.color` = `#6B7280` ; `Chart.defaults.borderColor` = `#E5E7EB`. Couleurs de séries injectées par la palette §2.2.

### 4.2 Centre de rapports — `public/js/rapports.js` (réécrit)

Structure de la page :
1. **Sélecteur de rapport** (liste déroulante / cartes de blocs).
2. **Barre de filtres globale** (`report-filters`) : Du / Au, Article (recherche), Catégorie, Agence (localité), Fournisseur, Type, puis **Regrouper par** (dimension) et **Top-N** quand pertinent.
3. **Ligne de KPI** (`report-kpis`) : 3-5 indicateurs du rapport (ex. total sorties, valeur, nb mouvements, solde).
4. **Graphique** (`report-chart`) : canvas Chart.js selon le type du rapport (line / bar / stacked bar / doughnut).
5. **Tableau détaillé** (`report-table`) : regroupé par dimension, avec lignes de total par groupe et total général.
6. **Boutons d'export** : Excel, CSV, Imprimer — avec **les filtres actuellement appliqués**.

**Pipeline commun** (`public/js/reportui.js`, nouveau) :
`buildFilters()` → `fetchReport(slug, params)` → `renderKpis()` → `renderChart()` → `renderTable()`.
Chaque rapport du catalogue = un objet de config :

```js
{ slug: 'mouvements', titre: 'Mouvements détaillés', type: 'line', groupBy: 'mois',
  kpis: ['entrees','sorties','solde','valeur'], filters: ['dates','article','categorie','localite','fournisseur','type','groupby'] }
```

### 4.3 Sources de filtres

Les listes des sélecteurs (articles, catégories, agences, fournisseurs, utilisateurs) proviennent du nouvel endpoint **`/api/rapports/v2/meta`** (lire §3.2). Celui-ci lit directement les tables en base, donc **ne dépend pas** des routes `/api/fournisseurs` ou `/api/commandes` (absentes du serveur actuellement, hors périmètre). Chargées une seule fois à l'ouverture de la page.

### 4.4 États

- **Chargement** : squelettes (classe `skeleton` existante).
- **Vide** : `UI.renderEmptyState('Aucune donnée sur la période.')`.
- **Erreur** : toast `UI.toast(..., 'error')` + état vide détaillé.

---

## 5. Catalogue des rapports (périmètre livré)

**Bloc 1 — Ventilation stock & valeur (split par dimension)**
1. Valeur & stock par **catégorie** (donut + tableau : nb articles, stock, valeur, alertes, ruptures).
2. Stock par **fournisseur** (barres horizontales + tableau).
3. Répartition **standard / numéroté** + par unité.
4. État du stock enrichi : filtres + graphique par catégorie + statuts colorés (OK/ALERTE/RUPTURE).

**Bloc 2 — Mouvements & consommation**
5. Mouvements détaillés : ligne du temps entrées/sorties (barres empilées), regroupable par jour/mois/article/agence/type/utilisateur.
6. Solde **mensuel** : entrées vs sorties par mois (barres empilées).
7. Consommation par article : **top-N** (barres horizontales) + tableau complet.
8. Par **utilisateur** : nb de mouvements, quantités saisies par agent.

**Bloc 3 — Flux par agence**
9. Sorties par agence : barres + **détail ligne-à-ligne** (agence × article × quantités × valeur).
10. **Valeur** des sorties par agence (donut).
11. Fiches de réception : par agence, par statut, par mois.
12. Retours de carnets : par agence + donut **usage / non-utilisé**.

**Bloc 4 — Suivi & écarts**
13. Commandes & **délais fournisseur** (statut, délai moyen commande → réception).
14. Inventaires / **écarts** : stock théorique vs compté, écart en valeur.
15. Alertes & ruptures : articles sous seuil, valeur en risque, fournisseur à contacter.

**Bonus**
16. **Articles dormants** : stock non nul sans mouvement depuis N jours (N réglable), par catégorie.
17. **Jours de couverture** : stock actuel / conso moyenne journalière (prévision de réapprovisionnement).
18. **Billets en circulation par agence** : mêmes indicateurs que la page Billets (émis / envoyés / retournés usage et non-utilisé), répartis par agence de sortie.
19. **Top 10 en valeur** : articles qui concentrent la valeur du stock (loi des 20/80).
20. **Évolution de la valeur du stock** dans le temps (mois).

---

## 6. Exports soignés

### 6.1 Excel (ExcelJS) — helper `buildWorkbook(titre, columns, rows, { totals, groupBy })`

Chaque export suit **exactement** cette présentation :
1. **Ligne de titre** : nom du rapport + période (ex. « Mouvements détaillés — 01/07/2026 → 08/08/2026 »), en **noir marque `#111827`**, texte blanc, gras, fusionnée sur toute la largeur.
2. **Ligne d'en-tête** : fond **turquoise `#0EA5A0`**, texte **blanc gras**, centré, bordures fines.
3. **Colonnes** : largeurs auto-ajustées ; **numériques alignés à droite** ; quantités `#,##0` ; valeurs `#,##0` FCFA (sans décimale, le stock est en unités entières).
4. **Lignes de données** : hauteur confortable, **alternance de fond** (`#E6F5F4` = info-bg turquoise clair sur 1 ligne sur 2) pour la lisibilité.
5. **Ligne de total** : gras, **bordure haute épaisse**, fond gris `#F3F4F6`.
6. **Volet figé** : gel des lignes de titre + en-tête (freeze `A3`).
7. Feuille **Résumé** en 2ᵉ onglet (indicateurs clés) pour les rapports principaux (stock, mouvements).

### 6.2 CSV

UTF-8 **BOM** (`﻿`), séparateur `;` (locale FR Excel), CRLF, en-tête = libellés des colonnes. L'objectif : s'ouvrir proprement dans Excel sans casse des accents.

### 6.3 Impression

`@media print` dans `app.css` pour la vue rapport :
- Masque topbar / navigation / barre de filtres / boutons.
- Affiche un **en-tête de marque** (logo + « Nizar Transport Voyageur — Rapport <titre> » + date), le tableau détaillé et les KPI.
- Tableaux avec bordures visibles, `-webkit-print-color-adjust: exact` pour conserver les couleurs d'alternance.

---

## 7. Gestion des erreurs

- **Backend** : 400 pour paramètres/dimensions invalides ou références inconnues ; 401 via `authenticate` existant ; 500 global géré par le middleware existant (SQLite → JSON).
- **Frontend** : toast d'erreur + état vide ; aucun crash si un graphique n'a pas de données (masquer le canvas).

---

## 8. Validation & tests

Pas de framework de tests dans le repo. Validation :
1. `node --check` sur chaque fichier JS modifié (routes + services + public).
2. Démarrage serveur local `PORT=3001` (évite le conflit avec Service-Achat sur 3000).
3. `curl` des endpoints v2 (JSON + xlsx + csv) avec et sans filtres, vérification des codes 400 sur paramètres invalides.
4. Contrôle visuel **Playwright** : ouverture de la page Rapports, rendu des graphiques, application des filtres, export Excel/CSV, impression.
5. Build : pas de build front ; vérification que `public/index.html`, `sw.js` et les nouveaux JS sont référencés correctement.

---

## 9. Hors périmètre (YAGNI)

- Pas de temps réel / websocket (rechargement à la demande).
- Pas de drill-down multi-niveaux (clic → détail) — le détail ligne-à-ligne est disponible via les regroupements et le tableau.
- Pas de PDF serveur par rapport (l'impression navigateur couvre le besoin ; les modèles Word/PDF existants restent pour les documents métier).
- Pas de nouvelles tables en base (toutes les données nécessaires existent).

---

## 10. Fichiers impactés

**Nouveaux** : `services/rapports.js`, `public/js/reportui.js`.
**Modifiés** : `routes/rapports.js` (endpoints v2), `public/js/rapports.js` (réécrit), `public/js/api.js` (URLs v2 + download), `public/index.html` (Chart.js CDN), `public/sw.js` (cache Chart.js), `public/css/app.css` (styles rapport + print).
