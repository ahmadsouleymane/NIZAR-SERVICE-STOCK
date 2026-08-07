# Déploiement de Nizar Stock — Render + GitHub Actions

L'app tourne en Node.js avec une base **SQLite**. On la déploie sur **Render**
(disque persistant) : la base et les photos sont conservées. GitHub Actions
vérifie le code à chaque push et déclenche le déploiement.

---

## 1. Pousser le projet sur GitHub

1. Crée un dépôt privé sur GitHub (ex. `nizar-stock`).
2. Pousse le projet :
   ```bash
   git remote add origin https://github.com/<ton-user>/nizar-stock.git
   git push -u origin main
   ```

## 2. Créer le service sur Render (2 façons)

### Option A — Blueprint (recommandé, tout automatique)
1. Va sur https://render.com → connecte-toi → **New → Blueprint**.
2. Connecte ton dépôt GitHub `nizar-stock`.
3. Render lit `render.yaml` et crée le service + le disque persistant `/data`.
4. Au moment de la création, Render **te demandera la valeur de `JWT_SECRET`** :
   génère-la avec `openssl rand -hex 32` et colle-la.
5. **Deploy** → quelques minutes → l'app est en ligne à une URL `https://nizar-stock.onrender.com`.

### Option B — Manuel
1. **New → Web Service** → connecter le dépôt.
2. Runtime : **Docker** (Render utilise le `Dockerfile`).
3. Ajouter un **disque persistant** : mount `/data` (1 Go suffit).
4. Variables d'environnement :
   - `NODE_ENV = production`
   - `JWT_SECRET = <openssl rand -hex 32>`
   - `DB_PATH = /data/nizar.db`
   - `UPLOAD_DIR = /data/uploads`
5. **Create Web Service** → l'app démarre.

> Render déploie automatiquement à chaque push sur `main` (intégration GitHub native).

## 3. (Optionnel) Webhook de déploiement dans GitHub Actions
1. Sur Render : **Settings → Deploy Hook** → copie l'URL.
2. Sur GitHub : **Settings → Secrets and variables → Actions → New repository secret**
   → nom `RENDER_DEPLOY_HOOK_URL` → colle l'URL.
3. Désormais chaque push sur `main` passe la **CI** (vérifications) puis déclenche
   Render via le webhook.

---

## 4. Une fois en ligne

- **Changer les mots de passe par défaut** : connexion → Paramètres → Utilisateurs
  (le compte admin est `Moustapha`, mot de passe par défaut `admin123` — À CHANGER).
- **Import des données** : après le premier déploiement, importer ton fichier Excel
  (Paramètres → Importer) puis vérifier les stocks.
- **Sauvegardes** : utiliser le bouton « Sauvegarde » régulièrement (les sauvegardes
  sont écrites sur le disque persistant `/data/backups`).

## 5. HTTPS

Render fournit **HTTPS automatiquement** (URL `https://…`). Avec HTTPS, la
**caméra intégrée** de l'app fonctionne aussi sur téléphone (getUserMedia).

## Variables d'environnement utiles

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute (3000) |
| `JWT_SECRET` | **Obligatoire en production** — secret de signature des jetons |
| `DB_PATH` | Emplacement du fichier SQLite (sur le disque persistant) |
| `UPLOAD_DIR` | Dossier des photos/PDF (sur le disque persistant) |
| `CORS_ORIGIN` | Optionnel — origine autorisée si un autre domaine accède à l'API |
