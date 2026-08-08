# Déploiement de Nizar Stock — Render (plan GRATUIT) + sauvegarde GitHub

L'app tourne en Node.js avec une base **SQLite**. Elle est déployée sur **Render
plan gratuit (0 €)**. Le plan gratuit n'a **pas de disque persistant** : la base
est donc **sauvegardée en continu dans un dépôt GitHub privé** (gratuit) par
`services/cloud_backup.js`, et **restaurée au démarrage** à chaque redéploiement.
Un **monitor UptimeRobot** (ping toutes les 5 min) maintient le service éveillé
pour éviter la mise en veille des 15 min.

> ⚠️ Plan gratuit Render : **750 h d'instance / mois**, **512 Mo RAM**, pas de
> disque persistant. Avec UptimeRobot 24/7, l'app consomme ~744 h/mois (marge
> ~6 h) — **surveille la page Billing** de Render.

---

## 1. Préparer le dépôt GitHub de sauvegarde (2 min)

1. Sur **https://github.com** → **New repository** → nom `nizar-stock-backup`
   → **Private** → Create.
2. **Settings → Developer settings → Personal access tokens → Fine-grained**
   → New token → limite-le à ce dépôt avec l'accès **Contents : Read and write**.
   Copie le jeton (commence par `github_pat_…`).

## 2. Pousser la base actuelle vers GitHub (une seule fois)

Depuis ton ordinateur, dans le dossier du projet :

```bash
GH_BACKUP_REPO=ahmadsouleymane/nizar-stock-backup \
GH_BACKUP_TOKEN=ton_jeton \
node scripts/push_initial_backup.js
```

→ Ton vrai `nizar.db` est uploadé : le déploiement ne partira **pas** d'une base vide.

## 3. Créer le service sur Render (gratuit)

1. Va sur **https://render.com** → connecte-toi (sans carte).
2. **New → Blueprint** → connecte le dépôt `NIZAR-SERVICE-STOCK`.
3. Render lit `render.yaml` (plan **free**) → demande les variables :
   - **`JWT_SECRET`** → colle le résultat de `openssl rand -hex 32`.
   - **`GH_BACKUP_REPO`** → `ahmadsouleymane/nizar-stock-backup`
   - **`GH_BACKUP_TOKEN`** → ton jeton GitHub.
4. **Deploy** → quelques minutes → l'app en HTTPS :
   **`https://nizar-stock.onrender.com`**.

## 4. Garder l'app éveillée (UptimeRobot)

1. Sur **https://uptimerobot.com** (gratuit) → **Add New Monitor**.
2. Type **HTTP(S)**, URL → `https://nizar-stock.onrender.com/`, intervalle **5 min**.
3. Le ping empêche la mise en veille (15 min d'inactivité) et donc le cold start.

## 5. Après le premier déploiement

- La base est **restaurée depuis GitHub** au démarrage (tes données actuelles).
- **Changer les mots de passe par défaut** : Paramètres → Utilisateurs
  (admin `Moustapha` / `admin123` — À CHANGER).

## Sauvegarde automatique (comment ça marche)

`services/cloud_backup.js` (base de données) :
- **au démarrage** → télécharge `nizar.db` depuis le dépôt privé (si le fichier local est vide) ;
- **toutes les ~3 min** → snapshot cohérent (`VACUUM INTO`) + upload GitHub ;
- **à l'arrêt (SIGTERM)** → dernier upload avant redéploiement.

`services/r2_backup.js` (photos / PDF) :
- **au démarrage** → télécharge depuis Cloudflare R2 les fichiers manquants ;
- **toutes les ~5 min** → upload vers R2 des nouveaux fichiers ;
- **à l'arrêt (SIGTERM)** → dernière synchronisation avant redéploiement.

## Réveil du serveur (plan gratuit)

Le service dort après 15 min d'inactivité. `public/js/wake.js` :
- **pré-réveil** dès l'ouverture de la page (le serveur démarre pendant la connexion) ;
- **écran « Réveil du serveur… »** qui réessaie automatiquement ;
- si une requête traîne (cold start) → **écran de chargement** puis reprise auto.

## 6. Cloudflare R2 — sauvegarde des photos (optionnel mais recommandé)

R2 conserve les photos/scans au-delà des redéploiements (10 Go gratuits).

1. Sur **https://dash.cloudflare.com** → **R2** → **Create bucket** → nom `nizar-uploads`.
2. **Manage R2 API Tokens** → *Create API token* → copie **Access Key ID** et **Secret Access Key**.
3. Dans Render, ajoute les variables :
   - `R2_ENDPOINT` → `https://<accountid>.r2.cloudflarestorage.com` (id dans l'URL de ton dashboard)
   - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` → ton jeton
   - `R2_BUCKET` → `nizar-uploads`

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | **Obligatoire** — secret de signature des jetons |
| `GH_BACKUP_REPO` | Dépôt GitHub privé de sauvegarde (ex: `owner/repo`) |
| `GH_BACKUP_TOKEN` | Jeton GitHub (accès Contents read/write) |
| `GH_BACKUP_PATH` | Chemin du fichier de base dans le dépôt (défaut `data/nizar.db`) |
| `GH_BACKUP_INTERVAL_MIN` | Fréquence de sauvegarde en minutes (défaut 3) |
| `R2_ENDPOINT` | Endpoint S3 de ton bucket R2 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Jeton API R2 |
| `R2_BUCKET` | Nom du bucket R2 (ex: `nizar-uploads`) |
| `R2_SYNC_INTERVAL_MIN` | Fréquence de synchro photos en minutes (défaut 5) |
| `DB_PATH` / `UPLOAD_DIR` | Dossiers dans le conteneur (éphémères, restaurés/sauvegardés) |
| `PORT` | Port d'écoute (3000) |

## ⚠️ Points d'attention

- **Heures d'instance** : l'app allumée 24/7 ≈ 744 h/mois (limite 750 h). Vérifie
  la page Billing une fois par mois (ou laisse dormir : usage réel ≈ 100-200 h).
- **Réveil** : ~1 min de chargement après 15 min d'inactivité (écran de chargement intégré).
- **GitHub Actions** : le workflow `deploy.yml` vérifie la syntaxe à chaque push ;
  Render redéploie automatiquement sur push (pas besoin de webhook).
