// routes/demandes.js — Demandes de l'assistant vers l'admin (suppression/modification
// d'un element que l'assistant n'a pas le droit d'executer lui-meme). L'admin voit
// les demandes en attente dans son tableau de bord, avec la note explicative, et
// peut accepter (executer via l'endpoint existant cote client) ou refuser.
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const router = express.Router();

// POST /api/demandes — l'assistant (ou tout utilisateur) cree une demande.
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { type, cible_type, cible_id, cible_label, note } = req.body;

  if (!['suppression', 'modification'].includes(type)) {
    return res.status(400).json({ error: 'Type de demande invalide.' });
  }
  if (!cible_type) return res.status(400).json({ error: 'Cible manquante.' });
  if (!note || !String(note).trim()) return res.status(400).json({ error: 'Une note expliquant la raison est requise.' });

  const result = db.prepare(`
    INSERT INTO demandes (user_id, username, type, cible_type, cible_id, cible_label, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, req.user.username, type, cible_type, cible_id || null, cible_label || null, String(note).trim());

  const demande = db.prepare('SELECT * FROM demandes WHERE id = ?').get(result.lastInsertRowid);
  logAudit(db, req.user.id, req.user.username, 'DEMANDE_' + type.toUpperCase(), (cible_label || cible_type) + ' — ' + String(note).trim().slice(0, 120));
  res.status(201).json({ demande });
});

// GET /api/demandes — admin : toutes (filtre ?statut) ; autre : ses propres demandes.
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const isAdmin = req.user.role === 'admin';
  const { statut } = req.query;

  let where = 'WHERE 1=1';
  const params = [];
  if (!isAdmin) { where += ' AND d.user_id = ?'; params.push(req.user.id); }
  if (statut) { where += ' AND d.statut = ?'; params.push(statut); }

  const demandes = db.prepare(`
    SELECT d.*, u.username as demandeur
    FROM demandes d LEFT JOIN users u ON d.user_id = u.id
    ${where}
    ORDER BY (d.statut = 'en_attente') DESC, d.date_creation DESC
    LIMIT 200
  `).all(...params);
  res.json({ demandes });
});

// GET /api/demandes/count — admin : nombre de demandes en attente (badge dashboard).
router.get('/count', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const n = db.prepare("SELECT COUNT(*) c FROM demandes WHERE statut = 'en_attente'").get().c;
  res.json({ en_attente: n });
});

// POST /api/demandes/:id/accepter — admin : marque la demande comme acceptee.
// L'operation reelle (suppression/modification) est effectuee par l'admin via les
// endpoints existants (cote client), cette route ne fait qu'enregistrer le traitement.
router.post('/:id/accepter', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const d = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
  if (d.statut !== 'en_attente') return res.status(400).json({ error: 'Demande déjà traitée.' });

  db.prepare(`
    UPDATE demandes SET statut = 'acceptee', traite_par = ?, traite_par_nom = ?,
      date_traitement = datetime('now','localtime') WHERE id = ?
  `).run(req.user.id, req.user.username, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'DEMANDE_ACCEPTEE', (d.cible_label || d.cible_type) + ' (demande #' + d.id + ' de ' + (d.username || '?') + ')');
  res.json({ demande: db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id) });
});

// POST /api/demandes/:id/refuser — admin : refuse la demande (note de reponse optionnelle).
router.post('/:id/refuser', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const d = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
  if (d.statut !== 'en_attente') return res.status(400).json({ error: 'Demande déjà traitée.' });

  db.prepare(`
    UPDATE demandes SET statut = 'refusee', traite_par = ?, traite_par_nom = ?,
      reponse_note = ?, date_traitement = datetime('now','localtime') WHERE id = ?
  `).run(req.user.id, req.user.username, (req.body.reponse_note || '').trim() || null, req.params.id);
  logAudit(db, req.user.id, req.user.username, 'DEMANDE_REFUSEE', (d.cible_label || d.cible_type) + ' (demande #' + d.id + ')');
  res.json({ demande: db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id) });
});

// DELETE /api/demandes/:id — admin : retire une demande de la liste (nettoyage).
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const d = db.prepare('SELECT * FROM demandes WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
  db.prepare('DELETE FROM demandes WHERE id = ?').run(req.params.id);
  res.json({ message: 'Demande supprimee.' });
});

module.exports = router;
