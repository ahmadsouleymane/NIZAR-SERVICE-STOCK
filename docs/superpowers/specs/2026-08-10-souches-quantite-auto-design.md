# Souches numérotées : quantité auto, validation stricte, anti-chevauchement par localité

## Contexte
Les articles numérotés (billets électroniques, carnets, bons) se comptent par plage
de numéros de souche. Aujourd'hui l'utilisateur saisit à la main la quantité ET la
plage, source d'erreurs. Règles métier confirmées par l'admin (2026-08-10), vérifiées
sur les données réelles restaurées.

## Règles (dérivées des données existantes)
- **Taille de lot par catégorie** (`categories.souches_par_unite`) :
  - Billets (électronique) = **500**
  - Carnets = **50**
  - Bon = **50** (les bons sont des carnets)
  - Autres catégories = NULL → comptage manuel inchangé.
- **Quantité** d'un article numéroté = `(numero_fin - numero_debut + 1) / souches_par_unite`.
  Doit être un entier positif, sinon **BLOCAGE** (strict, aucune tolérance).
- **Validité d'une plage** : `numero_debut <= numero_fin` ET `(fin - debut + 1)` multiple
  exact de la taille de lot.
- **Anti-chevauchement** :
  - Article `souche_par_localite = 1` (défaut pour les « point de vente ») : une même
    plage sur **deux localités différentes n'est PAS un conflit** ; le chevauchement
    n'est vérifié qu'**au sein d'une même localité** (destination de la fiche).
  - Sinon : chevauchement **global par article** (comportement actuel, inchangé).
  - Entrées (fournisseur, sans localité) : toujours global.

## Schéma (migrations `ensureColumn`)
- `categories.souches_par_unite INTEGER DEFAULT NULL`
- `articles.souche_par_localite INTEGER NOT NULL DEFAULT 0`
- Seed unique : Billets→500, Carnets→50, Bon→50 (par nom actuel) ;
  `souche_par_localite=1` pour les articles dont le nom contient « point de vente ».

## Backend
- `services/series.js` :
  - `quantiteDepuisSouche(lot, d, f)` → quantité entière ou `null` si invalide.
  - `validerSouche(lot, d, f)` → `{ ok, raison }`.
  - `checkOverlap(db, article_id, d, f, source_type, opts)` : `opts.localite_id`
    + `opts.perLocalite` → restreint la recherche de chevauchement à la même localité
    (via `series_numeros.source_id → fiches_reception.localite_id`).
- `routes/categories.js` : expose/édite `souches_par_unite`.
- `routes/articles.js` : expose/édite `souche_par_localite`.
- `routes/fiches_reception.js` (création + modif sortie) : pour un article numéroté
  dont la catégorie a une taille de lot, **calcule la quantité côté serveur** depuis la
  plage (source de vérité), **bloque** si invalide ; passe `localite_id`/`perLocalite`
  à `checkOverlap`.
- `routes/entrees.js` : même calcul/validation stricte (overlap reste global).
- `routes/mouvements.js` : nouvelle route `GET /anomalies-souches` (plages présentes mais
  invalides) + `PATCH /:id/numero-corriger` (autorise l'écrasement d'une plage invalide,
  contrairement à la correction existante qui exige une plage absente).

## Frontend
- `parametres.js` : champ « Souches par unité » dans la fiche catégorie ; nouvelle
  section « Souches invalides » (liste + correction manuelle admin, réutilise le pattern
  anomalies existant).
- `articles.js` : case « Numérotation par localité » (articles numérotés).
- `fiches.js` (sortie) : pour un article numéroté, quantité **calculée et non modifiable**
  depuis la plage ; validation avant envoi (message clair).
- `entrees.js` : idem.
- `api.js` : endpoints anomalies-souches + correction + champs nouveaux.

## Hors scope / sécurité
- Aucune donnée existante modifiée automatiquement : les souches déjà invalides sont
  seulement **listées** pour correction manuelle.
- Blocage strict s'applique aux **nouvelles** saisies uniquement.
- Tests en local avec sauvegardes désactivées (NODE_ENV != production) — plus aucun
  risque prod.
