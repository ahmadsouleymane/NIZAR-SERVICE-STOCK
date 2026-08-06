// routes/audit.js — Lecture du journal d'audit (admin)
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/audit — journal des operations sensibles
router.get('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { limit } = req.query;
  const lim = parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 200;
  const logs = db.prepare(`
    SELECT al.*, u.username
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.id DESC LIMIT ?
  `).all(lim);
  res.json({ logs });
});

module.exports = router;
