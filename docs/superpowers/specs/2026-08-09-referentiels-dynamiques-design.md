# Référentiels dynamiques (catégories, unités) — design

## Contexte

L'admin modifie des données de référence (fournisseur, unité...) et constate que
certaines modifications ne sont pas possibles du tout, et que d'autres ne se
répercutent pas partout dans le système (affichage, impression PDF).

## Diagnostic

1. **Catégories** et **Unités** n'ont pas de route `PUT` (ni de bouton "Modifier"
   dans Paramètres) — seuls Ajouter/Supprimer existent. Localités et
   Utilisateurs, eux, ont déjà ce pattern complet.
2. Le libellé d'une unité est dupliqué **trois fois en dur** dans le code
   (`public/js/ui.js`, `services/pdf.js`, `public/js/fiches.js`), complètement
   déconnecté de la table `unites` que l'admin gère dans Paramètres. Résultat :
   ajouter/renommer une unité n'a aucun effet sur l'affichage ni sur le PDF.
3. Le fournisseur, lui, est déjà correctement dynamique (jointure SQL en direct
   par id) — rien à changer de ce côté.
4. Aucune donnée n'est perdue par un mécanisme de cache : toutes les écritures
   passent par better-sqlite3 (`db.prepare(...).run()`) directement sur le
   fichier `.db`. Le point 2 est un problème d'*affichage* (donnée non relue),
   pas de persistance.

## Changements

### Backend
- `routes/categories.js` : ajout de `PUT /:id` (nom + description), + audit log
  (même pattern que `routes/localites.js`).
- `routes/unites.js` : ajout de `PUT /:id` — **seul le `label` est modifiable**,
  le `code` reste figé pour ne jamais casser le lien avec `articles.unite` ou
  les valeurs déjà enregistrées dans `fiche_reception_articles.unite`.
- `routes/fiches_reception.js` et `routes/entrees.js` : les requêtes qui
  résolvent l'unité affichée (`COALESCE(NULLIF(fra.unite,''), a.unite)` ou
  `a.unite`) ajoutent une jointure `LEFT JOIN unites` pour retourner le
  **libellé actuel** quand la valeur stockée correspond à un code connu ; sinon
  la valeur brute déjà enregistrée passe telle quelle (aucune réécriture des
  fiches existantes, aucune perte des choix déjà faits manuellement par
  l'admin sur une ligne).

### Frontend
- `public/js/ui.js` : `UI.uniteLabel()` consulte un cache `_unitesMap` chargé
  depuis `/api/unites`, avec la table en dur actuelle comme filet de sécurité
  pour d'anciennes valeurs libres (ex. « Lot de 500 »).
- `public/js/app.js` : `UI.loadUnitesCache()` est appelée à chaque construction
  de la navigation (connexion + restauration de session).
- `public/js/parametres.js` : Catégories et Unités passent au même pattern que
  Localités — un bouton "Modifier" ouvrant une modale pré-remplie, en plus du
  formulaire d'ajout existant. Le cache d'unités est rechargé après toute
  modification.
- `public/js/fiches.js` : `_uniteOptions()` pour les articles standards inclut
  les unités gérées par l'admin (issues de `UI._unitesMap`), en plus des choix
  fixes « Lot de 500 / Lot de 50 » réservés aux articles numérotés (billets,
  carnets), qui restent un mécanisme séparé propre à la numérotation.

## Hors scope
- Articles, Fournisseurs, Localités : déjà en CRUD complet et déjà dynamiques,
  aucun changement nécessaire.
- Pas de migration de données : uniquement de nouvelles routes + reconnexion
  de l'affichage à la table `unites` existante.
