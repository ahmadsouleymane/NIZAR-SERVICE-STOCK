# Spécification — Nizar Stock V2 : Entrées fournisseur, Envois agences et archivage

**Date :** 2026-08-06
**Produit :** Application web PWA de gestion de stock — Nizar Transport Voyageur
**Base existante :** app Nizar Stock V1 (Express + SQLite + SPA vanilla + PDF pdfkit). Cette spécification décrit les **évolutions** à apporter, pas une refonte.

---

## 1. Résumé

Le gestionnaire de stock gère trois familles de produits : **carnets/billets**, **documentation** et **fournitures de bureau**. Le système doit synthétiser **l'entrée, la sortie et le stock en temps réel**.

Deux flux documentaires distincts, avec des exigences opposées :

1. **Entrée fournisseur** (marchandises reçues de l'extérieur) : **aucune impression** générée par l'app. Les articles arrivent avec le **bon de livraison** et la **facture** émis par le fournisseur (documents physiques, transmis au service achat puis à la comptabilité). L'app enregistre l'entrée (fournisseur, n° bon de livraison, n° facture, lignes + numéros de souche) et permet **d'archiver des photos du bon de livraison et de la facture** rattachées à la fiche d'entrée.

2. **Envoi vers une agence/localité** : on crée une **fiche de réception (= note d'envoi)** qui accompagne les articles. Le **PDF est généré et imprimé** à la création. L'agence reçoit, **signe** et renvoie la fiche au service stock. Le gestionnaire marque le retour **« OK »** → la fiche est **archivée** et le PDF reste **ré-imprimable à volonté**, même des années après (2ᵉ, 3ᵉ impression…).

Le tout repose sur un **suivi précis des numéros de souche** (séries, refus de chevauchement) et une **mise à jour du stock en temps réel**.

---

## 2. Flux documentaires

### 2.1 Entrée fournisseur (sans impression)

```
Fournisseur ──(bon de livraison + facture, papier)──▶ Service stock / Service achat
                                                          │
Stock manager ── enregistre dans l'app ──────────────────▶ Entrée (FE-…)
                                                          ├─ fournisseur, date
                                                          ├─ n° bon de livraison, n° facture
                                                          ├─ lignes : article, qté, n° début→fin
                                                          ├─ photos BL + facture (caméra/upload)
                                                          └─ effet : stock +, mouvement 'entree'
```

- **Aucun PDF généré côté app.**
- Les photos du bon de livraison et de la facture sont **archivées** avec la fiche et restent consultables.
- La fiche d'entrée reste listée et consultable (traçabilité, rapprochement achat/comptabilité).

### 2.2 Envoi vers agence (avec impression)

```
Stock manager ── crée la fiche de réception ──▶ PDF généré + imprimé (note d'envoi)
                                                    │
                                                    ▼
Agence ── reçoit les articles, signe ──▶ renvoie la fiche signée au service stock
                                                    │
                                                    ▼
Stock manager ── « OK — Retour reçu » ──▶ fiche archivée (badge OK)
                                                    │
                                                    ▼
PDF ré-imprimable à tout moment (historique)
```

- Cycle de statut : `envoyee` → `signee` (OK — retour reçu) → `archivee`.
- Ré-impression illimitée du PDF, y compris longtemps après l'archivage.

---

## 3. Modèle de données

### 3.1 Nouvelles tables

**`fiches_entree`** — enregistrement des entrées fournisseur

| Colonne | Type | Contrainte |
|---|---|---|
| id | INTEGER | PK |
| reference | TEXT | UNIQUE — `FE-YYMM-###` (année 2 chiffres, mois, séquence) — aligné sur `FR-YYMM-###` existant |
| fournisseur_id | INTEGER | FK → fournisseurs.id |
| date_entree | TEXT | ISO datetime |
| numero_bl | TEXT | n° bon de livraison (nullable) |
| numero_facture | TEXT | n° facture (nullable) |
| notes | TEXT | nullable |
| user_id | INTEGER | FK → users.id |
| statut | TEXT | `'validee'` \| `'archivee'` |
| created_at / updated_at | TEXT | ISO datetime |

**`fiche_entree_articles`** — lignes d'une fiche d'entrée

| Colonne | Type | Contrainte |
|---|---|---|
| id | INTEGER | PK |
| fiche_id | INTEGER | FK → fiches_entree.id ON DELETE CASCADE |
| article_id | INTEGER | FK → articles.id |
| quantite | INTEGER | > 0 |
| numero_debut | TEXT | nullable — premier n° de souche |
| numero_fin | TEXT | nullable — dernier n° de souche |
| observation | TEXT | nullable |

**`fiche_entree_photos`** — photos du bon de livraison et de la facture

| Colonne | Type | Contrainte |
|---|---|---|
| id | INTEGER | PK |
| fiche_id | INTEGER | FK → fiches_entree.id ON DELETE CASCADE |
| fichier_path | TEXT | chemin relatif `/uploads/…` |
| type | TEXT | `'bl'` \| `'facture'` \| `'autre'` |
| created_at | TEXT | ISO datetime |

**`series_numeros`** — historique des plages de numéros de souche par article (contrôle de chevauchement)

| Colonne | Type | Contrainte |
|---|---|---|
| id | INTEGER | PK |
| article_id | INTEGER | FK → articles.id |
| numero_debut | TEXT | |
| numero_fin | TEXT | |
| quantite | INTEGER | |
| source_type | TEXT | `'entree'` \| `'sortie'` \| `'retour'` |
| source_id | INTEGER | id du document/mouvement d'origine |
| date | TEXT | ISO datetime |

### 3.2 Modifications de tables existantes

**`mouvements`** : ajouter `numero_debut TEXT`, `numero_fin TEXT` et `entree_id INTEGER REFERENCES fiches_entree(id) ON DELETE SET NULL` (nullable) — pour conserver les n° de souche dans l'historique et rattacher un mouvement d'entrée à sa fiche.

**`fiches_reception`** : **aucune migration nécessaire** — le statut existant `signee` (déjà dans le CHECK) sert d'étape « OK — retour reçu ». La route `PATCH /statut` est simplement étendue pour l'accepter.

> Migration : `ALTER TABLE ADD COLUMN` (gardé par `PRAGMA table_info`) pour les colonnes ajoutées sur `mouvements` ; nouvelles tables via `CREATE TABLE IF NOT EXISTS`.

---

## 4. Règles métier

### 4.1 Entrée fournisseur

- **Pas de PDF/impression.** Seulement l'enregistrement.
- Ligne obligatoirement liée à un article existant, quantité > 0.
- Pour un article `numerote` : la plage `numero_debut`/`numero_fin` est requise et **doit être cohérente** (début ≤ fin, pas de chevauchement avec une plage déjà enregistrée pour ce même article — vérifié via `series_numeros`).
- Effets en une transaction :
  1. Insertion `fiches_entree` (statut `validee`).
  2. Insertion des lignes `fiche_entree_articles`.
  3. Insertion des plages dans `series_numeros` (source_type `entree`).
  4. Mouvement d'`entree` dans `mouvements` (+ `numero_debut`/`numero_fin`).
  5. `stock_actuel = stock_actuel + quantite` sur l'article.
- Photos BL/facture : upload après création, rattachées à la fiche (type `bl`/`facture`).

### 4.2 Envoi vers agence (fiche de réception)

- Reprise du flux existant : destination (localité/agence), lignes article/qté/n° de souche.
- Contrôles : stock suffisant pour la sortie ; pour un article `numerote`, la plage envoyée ne doit pas **chevaucher une plage déjà envoyée** (contrôle via `series_numeros`).
- Effets en une transaction : fiche `envoyee`, lignes, mouvements de `sortie` (+ n° de souche), plages en `series_numeros` (source_type `sortie`), stock décrémenté.
- **PDF généré automatiquement** à la création (mise en page actuelle : logo NIZAR, en-tête turquoise, tableau `Article | N° début | N° fin | Quantité | Unité`, signatures, note « À renvoyer au service stock dès réception », pied de page).

### 4.3 Retour « OK » et archivage

- Action « **OK — Retour reçu** » sur une fiche `envoyee` : statut → `signee` (badge **OK**). L'utilisateur peut éventuellement joindre une photo/scan du document signé (upload existant).
- L'archivage se fait ensuite via le statut `archivee` ; une fiche `signee`/`archivee` est considérée comme clôturée.
- **Ré-impression** : le PDF est toujours disponible (`GET /api/fiches/:id/pdf`), servi depuis `fichier_path` s'il existe, sinon régénéré. Aucune limite de ré-impression.

### 4.4 Retours de carnets (existant, inchangé)

- Le module `retours_carnets` (usage / non utilisé) est conservé. Un retour `non_utilise` réintègre le stock ; un retour `usage` est tracé mais ne réintègre pas le stock.

---

## 5. Synthèse stock en temps réel

- Le `stock_actuel` de chaque article est mis à jour **dans la même transaction** que chaque mouvement (déjà en place).
- **Tableau de bord** : enrichi d'un état du stock synthétique — total articles, alertes stock bas (`stock_actuel ≤ stock_min`), mouvements du jour (entrées/sorties), dernières fiches d'entrée et de réception.
- Aucun recalcul global nécessaire : la synthèse se lit à partir de `articles.stock_actuel` et de l'historique `mouvements`.

---

## 6. API (ajouts / modifications)

```
GET   /api/entrees            → liste des fiches d'entrée (filtres : fournisseur, statut, période)
POST  /api/entrees            → créer une entrée { fournisseur_id, numero_bl, numero_facture, notes, articles:[{article_id, quantite, numero_debut, numero_fin, observation}] }
GET   /api/entrees/:id        → détail (lignes + photos)
POST  /api/entrees/:id/photos → upload photo { file, type: 'bl'|'facture'|'autre' } (multer, max 10 Mo)
DELETE /api/entrees/:id       → suppression (admin)

PATCH /api/fiches/:id/statut → (existant, étendu) accepte désormais `signee` pour marquer « OK — Retour reçu »
GET   /api/fiches/:id/pdf     → (existant) téléchargement/ré-impression du PDF

GET   /api/series/:article_id → (nouveau, admin/assistant) historique des plages de numéros d'un article
```

---

## 7. Frontend

### 7.1 Nouvelle page « Entrées » (`public/js/entrees.js`)

- Liste des fiches d'entrée (référence, fournisseur, date, n° BL, n° facture, statut, nb lignes).
- Bouton « Nouvelle entrée » :
  1. Fournisseur (select) + date + **n° bon de livraison** + **n° facture** + notes.
  2. Lignes : article (select avec badge stock), quantité, n° début / n° fin (champs affichés en priorité pour les articles `numerote`).
  3. Validation → l'entrée est enregistrée, stock mis à jour, toast de confirmation. **Aucune impression.**
  4. Enchaînement proposé : « Prendre en photo le bon de livraison / la facture ? » (caméra mobile `capture="environment"` ou upload).
- Détail d'une entrée : lignes + **galerie des photos** BL/facture (consultables, agrandissables).
- Actions : ajouter une photo, archiver (optionnel), supprimer (admin).

### 7.2 Page « Fiches » (existant, ajustée)

- Sur une fiche `envoyee` : bouton **« OK — Retour reçu »** → statut `signee` → badge **OK**.
- Le PDF reste téléchargeable/ré-imprimable sur toutes les fiches (envoyée, OK, archivée).
- Affichage du cycle de statut : `envoyee` → `signee` (OK) → `archivee`.

### 7.3 Navigation et dashboard

- Ajout de la page « Entrées » dans la navigation (bottom nav mobile / sidebar desktop) à côté de « Fiches ».
- **Tableau de bord** : carte de synthèse entrées/sorties/stock et dernières entrées + dernières fiches.

---

## 8. Impression PDF (mise en page conservée)

- Service `services/pdf.js` étendu pour accepter un **type de document** :
  - `sortie` → titre **FICHE DE RÉCEPTION** (envoi agence) — contenu actuel conservé.
  - `sortie` alias → **NOTE D'ENVOI** (même mise en page, titre différent) si l'utilisateur le souhaite.
  - Les fiches d'entrée **n'ont pas de PDF**.
- En-tête : logo NIZAR + « NIZAR TRANSPORT VOYAGEUR » + titre turquoise + ligne de séparation.
- Bloc infos : référence, date, destination (ou fournisseur + n° BL/facture pour un futur type).
- Tableau : `Article | N° début | N° fin | Quantité | Unité`, en-tête noir, fond alterné, pagination avec répétition de l'en-tête.
- Signatures : « Gestionnaire de stock » (gauche) / « Chef d'agence — Date et signature à la réception » (droite).
- Note « NB : À renvoyer au service stock dès réception » + pied de page généré par le système.

---

## 9. Sécurité & rôles

| Action | Admin | Assistant |
|---|---|---|
| Créer / consulter entrées et envois | ✅ | ✅ |
| Upload photos BL/facture | ✅ | ✅ |
| Marquer « OK — Retour reçu » | ✅ | ✅ |
| Ré-imprimer un PDF archivé | ✅ | ✅ |
| Supprimer une entrée / une fiche | ✅ | ❌ |
| Gérer fournisseurs / comptes / catégories | ✅ | ❌ |

---

## 10. Tests de recette

1. `node database/init.js` — la migration s'exécute sans erreur (colonnes ajoutées, tables créées).
2. Démarrage serveur : `node server.js` — aucune erreur.
3. Créer une entrée fournisseur (article `numerote` avec plage 12501→12551) → le stock augmente, mouvement `entree` visible avec n° de souche, **aucun PDF généré**.
4. Tentative d'entrée avec une plage déjà enregistrée → refus (chevauchement).
5. Upload d'une photo de facture sur l'entrée → visible dans le détail.
6. Créer un envoi vers une agence → PDF généré, stock diminue, statut `envoyee`.
7. Action « OK — Retour reçu » → statut `signee` (badge OK), puis `archivee`.
8. Ré-impression du PDF de la fiche archivée → téléchargement OK.
9. Tableau de bord : les entrées/sorties du jour et l'état du stock sont à jour.

---

## 11. Hors périmètre (V2)

- Pas de PDF pour les entrées fournisseur (exigence explicite).
- Pas de gestion des prix / coûts d'achat sur les entrées (le `prix_unitaire` reste un attribut article optionnel, non saisi ici).
- Pas d'intégration comptable ; les photos BL/facture servent d'archivage de référence.
