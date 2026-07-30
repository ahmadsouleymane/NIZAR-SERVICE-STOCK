// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis.' });
  }

  const db = req.db;
  const user = db.prepare('SELECT id, username, password, role FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = req.db;
  const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur introuvable.' });
  }
  res.json({ user });
});

module.exports = router;
