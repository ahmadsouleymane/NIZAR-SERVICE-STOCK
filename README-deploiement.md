# Déploiement de Nizar Stock — Render (plan Starter) + GitHub Actions

L'app tourne en Node.js avec une base **SQLite**. On la déploie sur **Render
plan Starter** (~7 $/mois) : le disque persistant conserve la base et les photos.
GitHub Actions vérifie le code à chaque push et déclenche le déploiement.

> ⚠️ Le plan **gratuit** de Render ne supporte **pas les disques persistants**
> (la base serait perdue à chaque redéploiement). Le plan **Starter** est le
> plus petit à inclure un disque.

---

## 1. Pousser le projet sur GitHub (déjà fait)

Le dépôt est **https://github.com/ahmadsouleymane/NIZAR-SERVICE-STOCK** (branche `main`).

## 2. Créer le service sur Render (Blueprint)

1. Va sur **https://render.com** → connecte-toi.
2. **New → Blueprint** → connecte le dépôt `NIZAR-SERVICE-STOCK`.
3. Render lit `render.yaml` et crée le service (plan **Starter**) + le disque `/data`.
4. Quand Render demande **`JWT_SECRET`** → colle le résultat de :
   ```bash
   openssl rand -hex 32
   ```
5. **Deploy** → quelques minutes → l'app est en ligne en HTTPS :
   **`https://nizar-stock.onrender.com`**.

## 3. Après le premier déploiement

- **Importer les données** : la base démarre **vide** (le fichier local n'est pas
  poussé). Connecte-toi puis **Paramètres → Importer** ton Excel : cela crée les
  articles, l'historique **et met à jour les stocks** (Feuil4).
- **Changer les mots de passe par défaut** : Paramètres → Utilisateurs
  (le compte admin est `Moustapha`, mot de passe par défaut `admin123` — À CHANGER).
- **Sauvegardes** : bouton « Sauvegarde » dans Paramètres (écrites sur le disque `/data/backups`).

## 4. Déploiement automatique à chaque push

Render déploie automatiquement à chaque push sur `main` (intégration GitHub native).
En option, pour que **GitHub Actions déclenche** le déploiement explicitement :
1. Sur Render : **Settings → Deploy Hook** → copie l'URL.
2. Sur GitHub : **Settings → Secrets and variables → Actions → New repository secret**
   → nom `RENDER_DEPLOY_HOOK_URL` → colle l'URL.

Le workflow `.github/workflows/deploy.yml` fait alors : **CI (vérifications)** à
chaque push, puis **déclenchement du déploiement Render**.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | **Obligatoire en production** — secret de signature des jetons |
| `DB_PATH` | Emplacement du fichier SQLite (sur le disque `/data`) |
| `UPLOAD_DIR` | Dossier des photos/PDF (sur le disque `/data`) |
| `PORT` | Port d'écoute (3000) |
