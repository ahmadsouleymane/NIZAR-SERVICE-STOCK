// routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/users (admin only)
router.get('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
  res.json({ users });
});

// POST /api/users (admin only)
router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis.' });
  }
  if (!['admin', 'assistant'].includes(role)) {
    return res.status(400).json({ error: 'Role invalide (admin ou assistant).' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Ce nom d\'utilisateur existe deja.' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role);

  const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ user });
});

// PUT /api/users/:id (admin only)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const { username, password, role } = req.body;

  if (username && username !== user.username) {
    const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.params.id);
    if (dup) return res.status(409).json({ error: 'Ce nom d\'utilisateur existe deja.' });
  }

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  }

  db.prepare('UPDATE users SET username = ?, role = ? WHERE id = ?').run(
    username || user.username,
    role && ['admin', 'assistant'].includes(role) ? role : user.role,
    req.params.id
  );

  const updated = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json({ user: updated });
});

// DELETE /api/users/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }

  const db = req.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Utilisateur supprime.' });
});

module.exports = router;
