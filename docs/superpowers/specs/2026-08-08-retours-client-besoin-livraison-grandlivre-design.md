# Spécification — Retours client : fiche de besoin, bon de livraison, garde-fou stock, grand livre, anomalies import

**Date :** 2026-08-08
**Produit :** Application web PWA de gestion de stock — Nizar Transport Voyageur
**Base existante :** app Nizar Stock V2 (Express + SQLite + SPA vanilla + PDF pdfkit/pdf-lib). Cette spécification décrit les **évolutions** à apporter suite aux retours du client après test, pas une refonte.

---

## 1. Contexte

Le client a testé le système et remonte 5 manques :

1. Pas de moyen de tracer une demande d'achat interne avant l'entrée en stock (« fiche de besoin »).
2. Quand le fournisseur n'envoie pas de bon de livraison papier, l'app doit pouvoir en générer un.
3. Un bug a laissé un article passer à **-10** en stock : aucune sortie ne doit être possible si le stock réel est insuffisant.
4. La page « Inventaire » actuelle (liste des articles + valeur) ne répond pas au besoin réel : le client veut un **grand livre chronologique** (date/heure, article, entrée, sortie, stock réel), exportable en Excel.
5. L'import de la feuille Excel historique (`Carnets et fournitures de gestion.xlsx`, feuille `Feuil1`, 3787 lignes) laisse 407 lignes de billets/carnets sans numéro de souche et 79 avec un format invalide, sans moyen de les corriger dans l'app.

---

## 2. Fiche de besoin (nouveau module)

### 2.1 Flux

```
Besoin d'achat ── creee (FB-YYMM-###) ──▶ transmise au service achat
                                              │
                                              ▼
                                   revenue (scan du document signé)
                                              │
                                              ▼
                                          archivee (optionnel)
```

- Pas de PDF généré par l'app : la fiche de besoin est un enregistrement numéroté (référence, date, articles souhaités + quantités, notes). L'utilisateur imprime/complète manuellement si besoin, transmet au service achat, puis **scanne le retour** (upload photo/PDF) — l'upload fait passer le statut à `revenue`.
- Le numéro de fiche de besoin peut ensuite être **référencé en texte libre** (optionnel, pas de lien vérifié) dans une entrée / bon de livraison.

### 2.2 Modèle de données

**`fiches_besoin`**

| Colonne | Type | Contrainte |
|---|---|---|
| id | INTEGER | PK |
| reference | TEXT | UNIQUE — `FB-YYMM-###` |
| date_creation | TEXT | ISO datetime |
| statut | TEXT | `'creee'` \| `'transmise'` \| `'revenue'` \| `'archivee'` |
| notes | TEXT | nullable |
| scan_path | TEXT | nullable — chemin `/uploads/…` du document scanné |
| user_id | INTEGER | FK → users.id |
| created_at / updated_at | TEXT | ISO datetime |

**`fiche_besoin_articles`**

| Colonne | Type | Contrainte |
|---|---|---|
| id | INTEGER | PK |
| fiche_id | INTEGER | FK → fiches_besoin.id ON DELETE CASCADE |
| article_id | INTEGER | FK → articles.id |
| quantite | INTEGER | > 0 |
| observation | TEXT | nullable |

### 2.3 Règles métier

- Création : référence auto, statut `creee`, lignes articles souhaités (aucun impact stock).
- `PATCH /:id/statut` → `transmise` (depuis `creee`).
- `POST /:id/scan` (upload) → statut passe automatiquement à `revenue`.
- `PATCH /:id/statut` → `archivee` (depuis `revenue` uniquement).
- Suppression : admin seulement, aucun impact stock à annuler (la fiche ne touche jamais le stock).

### 2.4 API

```
GET    /api/fiches-besoin            → liste (filtres : statut, période)
POST   /api/fiches-besoin            → créer { notes, articles:[{article_id, quantite, observation}] }
GET    /api/fiches-besoin/:id        → détail (lignes)
PATCH  /api/fiches-besoin/:id/statut → transmise | archivee
POST   /api/fiches-besoin/:id/scan   → upload scan retour (multer), statut -> revenue
DELETE /api/fiches-besoin/:id        → suppression (admin)
```

### 2.5 Frontend

- Nouvelle page « Fiches de besoin » (`public/js/fiches_besoin.js`), sur le modèle de Retours carnets : liste, création, badge de statut, action « Marquer transmise », upload scan retour, archivage.
- Ajout dans la navigation (sidebar/bottom-nav + menu rapide « Nouveau »).

---

## 3. Bon de livraison généré (entrées sans BL fournisseur)

### 3.1 Principe

Deux cas pour une entrée :
- **Le fournisseur a fourni un bon de livraison papier** → flux actuel inchangé (photo `type='bl'` uploadée).
- **Aucun bon de livraison reçu** → l'app **génère** un PDF « BON DE LIVRAISON » à partir du modèle graphique existant (`services/modeles/bon-de-reception.pdf`, même charte Nizar), que ce document généré tient lieu de justificatif.

### 3.2 Modèle de données

`fiches_entree` : ajout de la colonne `fichier_path TEXT` (chemin du PDF généré, nullable — miroir de `fiches_reception.fichier_path`).

### 3.3 Règles métier

- Nouvelle route `POST /api/entrees/:id/bon-livraison` : génère le PDF à partir des données du brouillon (`articles_json`, fournisseur, numero_bl, numero_facture, numero_fiche_besoin), l'enregistre dans `fiches_entree.fichier_path`.
- Contenu du PDF (overlay sur le modèle existant, même technique que `generateFichePDF`) :
  - Titre retitré **« BON DE LIVRAISON »** (recouvre le titre imprimé du modèle).
  - Bloc infos : **Fournisseur**, **Date**, **N° BL** (si connu), **N° fiche de besoin** (si renseigné) — recouvre les libellés « Destination »/« Date » du modèle et les remplace.
  - Tableau identique : Article / N° Souche / Quantité / Unité.
  - Signatures adaptées : « Livreur » (gauche) / « Gestionnaire de stock » (droite).
- La validation d'une entrée (`POST /:id/valider`) accepte comme preuve de bon de livraison **soit** une photo `type='bl'` **soit** ce PDF généré (`fiches_entree.fichier_path` non nul). La facture reste **obligatoire** dans tous les cas (aucun changement sur ce point).
- Le PDF généré reste re-téléchargeable à tout moment (`GET /api/entrees/:id/pdf`, nouvelle route, sur le même modèle que celle des fiches de réception).

### 3.4 Frontend

- Sur le formulaire de création d'entrée : champ **N° fiche de besoin** (texte libre, optionnel) ajouté à côté de N° BL / N° facture.
- Sur le détail d'une entrée en brouillon, si aucune photo BL n'est présente : bouton **« Générer le bon de livraison »** → appelle la nouvelle route, affiche le PDF généré (téléchargeable), débloque la validation.

---

## 4. Garde-fou stock (blocage sortie si stock insuffisant)

### 4.1 Constat

`routes/fiches_reception.js` (`POST /`) contient aujourd'hui un commentaire explicite : *« Pas de contrôle de stock : le gestionnaire enregistre les sorties même si le stock théorique est à 0 »*. C'est ce qui a permis à un article de passer à -10.

### 4.2 Règle

- Avant d'insérer chaque ligne de sortie, vérifier `article.stock_actuel >= quantite` ; sinon lever une erreur métier (400) : *« Stock insuffisant pour {article} : {stock_actuel} {unite} disponible(s), {quantite} demandé(s). »*
- **Blocage strict pour tous les rôles**, sans dérogation admin.
- S'applique uniquement à `fiches_reception.js` (sorties vers agence) — `routes/mouvements.js` a déjà ce contrôle ; `inventaires.js` (comptage physique) n'est pas concerné, il ajuste le stock à la réalité comptée.

---

## 5. Grand livre (page « Inventaire »)

### 5.1 Principe

La page menu **« Inventaire »** (actuellement `InventaireStock`, liste articles + stock + valeur — redondante avec la page Articles) devient un **livre journal chronologique** : chaque mouvement de chaque article, avec le solde cumulé après ce mouvement.

| Date/heure | Article | Entrée | Sortie | Stock réel |
|---|---|---|---|---|
| 02/01/2026 08:14 | Scotch emballage | 6 | — | 6 |
| 03/01/2026 10:02 | Scotch emballage | — | 2 | 4 |

### 5.2 Source des données

Tous les mouvements (entrées fournisseur, sorties vers agence, ajustements d'inventaire, mouvements admin génériques) atterrissent déjà dans la table `mouvements`. Le grand livre se construit **entièrement à partir de cette table**, sans nouvelle table.

- Solde cumulé : calculé côté serveur, **chronologique par article** (tri date puis id), somme courante `entree - sortie`.

### 5.3 API

```
GET /api/inventaires/journal         → { lignes: [{date, article_id, article_nom, entree, sortie, stock_reel}], filtres: article_id, debut, fin }
GET /api/inventaires/journal/export  → export .xlsx (mêmes filtres), via la librairie xlsx déjà utilisée par l'import
```

### 5.4 Frontend

- La page « Inventaire » (nav id `inventaire`) pointe désormais vers un nouveau module (remplace `InventaireStock` dans le mapping de `app.js`) : tableau du grand livre, filtres article/période, bouton **Exporter (Excel)**.
- La page « Comptage » (nav id `comptage`, inchangée) reste le module de comptage physique existant.
- Le contenu perdu de `InventaireStock` (stock + valeur par article) reste disponible via la page Articles et la page Rapports — aucune perte fonctionnelle.

---

## 6. Anomalies d'import (correction admin)

### 6.1 Constat

Sur les 3787 lignes de `Carnets et fournitures de gestion.xlsx` (feuille `Feuil1`) :
- 407 lignes de billets/carnets n'ont **aucun numéro de souche**.
- 79 lignes ont un numéro **mal formé** (texte, plusieurs plages…) — et le parseur actuel (`parseRange` dans `scripts/import_v2.js`) peut, dans certains cas, **concaténer les chiffres** d'une chaîne mal formée en un nombre erroné au lieu de rejeter la ligne.

### 6.2 Corrections

- **`parseRange`** durci : n'accepte que `^\d+$` (un seul numéro) ou `^\d+\s*-\s*\d+$` (plage) après nettoyage des espaces ; tout le reste retourne `null` (ligne sans plage, à corriger manuellement) plutôt que de produire un nombre absurde.
- Nouvelle route `GET /api/mouvements/anomalies` : liste les mouvements d'articles `type_article = 'numerote'` sans `numero_debut`/`numero_fin` valides.
- Nouvelle route `PATCH /api/mouvements/:id/numero` (admin) : saisie manuelle de la plage, avec contrôle anti-chevauchement (réutilise `checkOverlap`/`recordSerie` de `services/series.js`).
- Frontend : nouvelle section dans la page **Paramètres** (visible admin uniquement) : tableau des anomalies avec formulaire de correction inline.

### 6.3 Ré-import (à confirmer séparément, hors de cette implémentation)

Le correctif de `parseRange` s'applique à tout futur import. Ré-exécuter `scripts/import_v2.js` sur la base actuelle **viderait et réimporterait** articles/mouvements/séries (opération destructive) — **ne sera fait qu'avec confirmation explicite du client**, en dehors de ce plan d'implémentation. Sans ré-import, les anomalies déjà en base restent corrigibles une à une via la nouvelle section Paramètres.

---

## 7. Sécurité & rôles

| Action | Admin | Assistant |
|---|---|---|
| Créer / consulter fiches de besoin | ✅ | ✅ |
| Upload scan retour fiche de besoin | ✅ | ✅ |
| Générer un bon de livraison | ✅ | ✅ |
| Consulter le grand livre / exporter | ✅ | ✅ |
| Corriger une anomalie d'import | ✅ | ❌ |
| Supprimer une fiche de besoin | ✅ | ❌ |

---

## 8. Tests de recette

1. `node database/init.js` — migration OK (nouvelles tables + colonne `fiches_entree.fichier_path`).
2. Créer une fiche de besoin, la transmettre, uploader un scan de retour → statut `revenue`, puis archiver.
3. Créer une entrée sans photo BL, cliquer « Générer le bon de livraison » → PDF téléchargeable, titre « BON DE LIVRAISON », infos fournisseur correctes ; la validation de l'entrée devient possible (facture toujours requise).
4. Créer une entrée avec numéro de fiche de besoin renseigné → apparaît sur le PDF généré.
5. Tenter une sortie avec quantité > stock réel → refusée (400), quel que soit le rôle connecté.
6. Grand livre : filtrer par article → solde cumulé cohérent avec `stock_actuel` de l'article sur la dernière ligne.
7. Export Excel du grand livre → fichier `.xlsx` valide, colonnes conformes.
8. Page Paramètres (admin) : une anomalie d'import corrigée met à jour `series_numeros` et empêche un chevauchement futur sur la même plage.

---

## 9. Hors périmètre

- Pas de PDF pour la fiche de besoin (enregistrement + scan uniquement).
- Pas de lien vérifié entre entrée et fiche de besoin (texte libre).
- Ré-import corrigé de la feuille Excel historique : décision et exécution séparées, hors de ce plan.
- Aucune modification du flux « sortie vers agence » (PDF, pipeline envoyee → retournee → archivee) autre que le garde-fou de stock.
