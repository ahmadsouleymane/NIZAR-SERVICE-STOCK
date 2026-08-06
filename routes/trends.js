// routes/trends.js — Tendance entrées/sorties des 14 derniers jours (tableau de bord)
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

function pad(n) { return String(n).padStart(2, '0'); }

// GET /api/trends
router.get('/', authenticate, (req, res) => {
  const db = req.db;

  const rows = db.prepare(`
    SELECT date(m.date) AS jour, m.type, SUM(m.quantite) AS total
    FROM mouvements m
    WHERE m.date >= datetime('now','localtime','-13 days')
    GROUP BY date(m.date), m.type
  `).all();

  const byDay = {};
  for (const r of rows) {
    if (!byDay[r.jour]) byDay[r.jour] = { entrees: 0, sorties: 0 };
    byDay[r.jour][r.type === 'entree' ? 'entrees' : 'sorties'] = r.total;
  }

  // 14 jours consécutifs, du plus ancien au plus récent (aujourd'hui inclus)
  const jours = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const b = byDay[iso] || { entrees: 0, sorties: 0 };
    jours.push({ date: iso, entrees: b.entrees, sorties: b.sorties });
  }

  res.json({ jours });
});

module.exports = router;
