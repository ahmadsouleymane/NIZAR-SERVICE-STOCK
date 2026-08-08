// routes/dashboard.js
const express = require('express');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = req.db;

  const totalArticles = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
  const alertesStock = db.prepare('SELECT COUNT(*) as count FROM articles WHERE stock_actuel <= stock_min').get().count;
  const mouvementsJour = db.prepare(
    "SELECT COUNT(*) as count FROM mouvements WHERE date >= date('now','localtime')"
  ).get().count;
  const commandesEnCours = db.prepare(
    "SELECT COUNT(*) as count FROM commandes WHERE statut IN ('brouillon', 'envoyee')"
  ).get().count;

  const valeurStock = db.prepare(
    "SELECT COALESCE(SUM(stock_actuel * prix_unitaire), 0) as v FROM articles"
  ).get().v;

  const entreesJour = db.prepare(
    "SELECT COUNT(*) as count FROM fiches_entree WHERE date_entree >= date('now','localtime')"
  ).get().count;

  const entreesRecentes = db.prepare(`
    SELECT fe.id, fe.reference, fe.date_entree, fe.numero_bl, fe.numero_facture, f.nom as fournisseur_nom
    FROM fiches_entree fe
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    ORDER BY fe.id DESC LIMIT 5
  `).all();

  const mouvementsRecents = db.prepare(`
    SELECT m.id, m.type, m.quantite, m.motif, m.date, a.nom as article_nom, u.username
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN users u ON m.user_id = u.id
    ORDER BY m.id DESC
    LIMIT 10
  `).all();

  const topAlertes = db.prepare(`
    SELECT a.id, a.nom, a.reference, a.stock_actuel, a.stock_min, a.unite,
           f.nom as fournisseur_nom
    FROM articles a
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.stock_actuel <= a.stock_min
    ORDER BY (a.stock_min - a.stock_actuel) DESC
    LIMIT 5
  `).all();

  res.json({
    kpi: { totalArticles, alertesStock, mouvementsJour, commandesEnCours, entreesJour, valeurStock },
    entreesRecentes,
    mouvementsRecents,
    topAlertes
  });
});

module.exports = router;
