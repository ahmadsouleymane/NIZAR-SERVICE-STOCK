// scripts/push_initial_backup.js — Pousse la base locale ACTUELLE vers le dépôt
// GitHub de sauvegarde. À lancer UNE SEULE FOIS (avant le premier déploiement
// Render) pour ne pas repartir d'une base vide en production.
//
// Usage :
//   GH_BACKUP_REPO=owner/repo GH_BACKUP_TOKEN=xxx node scripts/push_initial_backup.js
//
// Le jeton GitHub doit avoir l'accès « Contents: read/write » sur ce dépôt.

const backup = require('../services/cloud_backup');

(async () => {
  try {
    await backup.pushInitial();
    console.log('✔ Base initiale poussée. Tu peux déployer sur Render.');
    process.exit(0);
  } catch (err) {
    console.error('✖ ' + err.message);
    process.exit(1);
  }
})();
