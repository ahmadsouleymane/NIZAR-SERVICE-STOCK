// routes/alertes.js — Compte des articles sous le seuil minimum (badge navigation)
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// GET /api/alertes/compte — nombre d'articles en alerte stock bas
router.get('/compte', authenticate, (req, res) => {
  const db = req.db;
  const count = db.prepare('SELECT COUNT(*) AS count FROM articles WHERE stock_actuel <= stock_min').get().count;
  res.json({ count });
});

module.exports = router;
