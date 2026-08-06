// routes/retours.js — Retours de carnets / articles (usage ou non_utilise)
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkOverlap, recordSerie, parseNumero } = require('../services/series');
const { logAudit } = require('../services/audit');
const router = express.Router();

// GET /api/retours
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { localite_id, type_retour } = req.query;

  let query = `
    SELECT rc.*, a.nom as article_nom, a.reference, l.nom as localite_nom, u.username
    FROM retours_carnets rc
    LEFT JOIN articles a ON rc.article_id = a.id
    LEFT JOIN localites l ON rc.localite_id = l.id
    LEFT JOIN users u ON rc.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (localite_id) { query += ' AND rc.localite_id = ?'; params.push(localite_id); }
  if (type_retour) { query += ' AND rc.type_retour = ?'; params.push(type_retour); }

  query += ' ORDER BY rc.id DESC LIMIT 200';
  const retours = db.prepare(query).all(...params);
  res.json({ retours });
});

// POST /api/retours
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { article_id, localite_id, type_retour, quantite, numero_debut, numero_fin, motif } = req.body;

  if (!article_id || !type_retour || !quantite) {
    return res.status(400).json({ error: 'Article, type de retour et quantite requis.' });
  }

  if (!['usage', 'non_utilise'].includes(type_retour)) {
    return res.status(400).json({ error: 'Type de retour invalide (usage ou non_utilise).' });
  }

  const qte = parseInt(quantite, 10);
  if (isNaN(qte) || qte <= 0) {
    return res.status(400).json({ error: 'La quantite doit etre un nombre positif.' });
  }

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  if (localite_id) {
    const loc = db.prepare('SELECT id FROM localites WHERE id = ?').get(localite_id);
    if (!loc) return res.status(400).json({ error: 'Localite introuvable.' });
  }

  try {
    const transaction = db.transaction(() => {
      // Numeros de souche requis + enregistres pour les articles numerotes
      if (article.type_article === 'numerote') {
        if (parseNumero(numero_debut) === null || parseNumero(numero_fin) === null) {
          throw new Error('La plage de numeros (debut-fin) est requise pour un article numerote : ' + article.nom + '.');
        }
        const overlap = checkOverlap(db, article_id, numero_debut, numero_fin, 'retour');
        if (overlap) {
          throw new Error('Chevauchement pour ' + article.nom + ' : plage ' + numero_debut + '-' + numero_fin + ' deja retournee (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
        }
      }

      const result = db.prepare(`
        INSERT INTO retours_carnets (article_id, localite_id, type_retour, quantite, numero_debut, numero_fin, motif, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(article_id, localite_id || null, type_retour, qte, numero_debut || null, numero_fin || null, motif || null, req.user.id);

      if (article.type_article === 'numerote') {
        recordSerie(db, article_id, numero_debut, numero_fin, qte, 'retour', result.lastInsertRowid);
      }

      // Retour non utilise : les numeros reviennent en stock (mouvement d'entree reel)
      if (type_retour === 'non_utilise') {
        db.prepare('UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
          .run(qte, article_id);

        db.prepare(`
          INSERT INTO mouvements (article_id, type, quantite, motif, user_id, localite_id, date)
          VALUES (?, 'entree', ?, 'Retour non utilise — remis en stock', ?, ?, datetime('now','localtime'))
        `).run(article_id, qte, req.user.id, localite_id || null);
      }
      // Retour usage : trace dans retours_carnets (archive), aucun mouvement de stock
      // pour ne pas fausser les totaux entree/sortie de l'historique.

      return result.lastInsertRowid;
    });

    const id = transaction();
    const retour = db.prepare(`
      SELECT rc.*, a.nom as article_nom, a.reference, l.nom as localite_nom, u.username
      FROM retours_carnets rc
      LEFT JOIN articles a ON rc.article_id = a.id
      LEFT JOIN localites l ON rc.localite_id = l.id
      LEFT JOIN users u ON rc.user_id = u.id
      WHERE rc.id = ?
    `).get(id);
    logAudit(db, req.user.id, req.user.username, 'CREER_RETOUR', (article.nom || '') + ' — ' + type_retour + ' x' + qte);
    res.status(201).json({ retour });
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
