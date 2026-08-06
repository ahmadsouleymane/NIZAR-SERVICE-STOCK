// services/audit.js — Journalisation des operations sensibles
function logAudit(db, userId, username, action, details) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, username, action, details) VALUES (?, ?, ?, ?)')
      .run(userId || null, username || null, action, details || null);
  } catch (e) {
    // Ne jamais faire echouer l'operation principale a cause d'une ecriture de log
  }
}

module.exports = { logAudit };
