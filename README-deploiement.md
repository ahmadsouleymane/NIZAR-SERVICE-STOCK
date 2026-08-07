# Déploiement de Nizar Stock — Fly.io + GitHub Actions

L'app tourne en Node.js avec une base **SQLite**. On la déploie sur **Fly.io** :
le plan gratuit inclut **3 Go de volume persistant** (la base + les photos sont
conservées). GitHub Actions vérifie le code à chaque push et redéploie.

---

## 1. Pousser le projet sur GitHub (déjà fait)

Le dépôt est **https://github.com/ahmadsouleymane/NIZAR-SERVICE-STOCK** (branche `main`).

## 2. Créer le compte et l'outil Fly

1. Crée un compte : **https://fly.io/app/sign-up** (plan gratuit, **aucune carte bancaire**).
2. Installe l'outil Fly (`flyctl`) :
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```
   Puis ouvre un nouveau terminal (ou recharge ton shell).
3. Connecte-toi (ouvre le navigateur) :
   ```bash
   fly auth login
   ```

## 3. Créer l'app + le volume persistant

Dans le dossier du projet :

```bash
# Crée l'app (lit le Dockerfile et fly.toml) sans déployer tout de suite
# Choisis une région proche (ex: ams pour Amsterdam, fra pour Francfort, lhr pour Londres)
fly launch --no-deploy

# Crée le volume persistant (la base + les photos y vivent) — 1 Go, gratuit
fly volumes create nizar_data --size 1 --region <la même région que l'app>

# Définit le secret JWT (obligatoire en production)
fly secrets set JWT_SECRET=$(openssl rand -hex 32)

# Déploie
fly deploy
```

Quelques minutes plus tard, l'app est en ligne en HTTPS :
**`https://nizar-stock.fly.dev`** (nom de l'app visible dans `fly.toml`, change-le s'il est pris).

## 4. Après le premier déploiement

- **Importer les données** : la base démarre **vide** (le fichier local n'est pas
  poussé). Connecte-toi puis **Paramètres → Importer** ton Excel : cela crée les
  articles, l'historique **et met à jour les stocks** (Feuil4).
- **Changer les mots de passe par défaut** : Paramètres → Utilisateurs
  (le compte admin est `Moustapha`, mot de passe par défaut `admin123` — À CHANGER).
- **Sauvegardes** : bouton « Sauvegarde » dans Paramètres (écrites sur le volume `/data/backups`).

## 5. Déploiement automatique à chaque push (GitHub Actions)

1. Génère un **jeton API Fly** :
   ```bash
   fly tokens create deploy
   ```
2. Sur GitHub : **Settings → Secrets and variables → Actions → New repository secret**
   → nom `FLY_API_TOKEN` → colle le jeton.
3. C'est tout : chaque `git push` sur `main` déclenche la **CI** (vérifications)
   puis le **déploiement Fly** automatique.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | **Obligatoire** — secret de signature des jetons (définie via `fly secrets set`) |
| `DB_PATH` | Emplacement du fichier SQLite (sur le volume `/data`) |
| `UPLOAD_DIR` | Dossier des photos/PDF (sur le volume `/data`) |
| `PORT` | Port d'écoute (3000) |

## Commandes Fly utiles

```bash
fly logs              # voir les logs de l'app
fly status            # état de l'app
fly volumes list      # volumes
fly secrets list      # secrets définis
fly scale show        # ressources
```
