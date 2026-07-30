// routes/commandes.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// GET /api/commandes
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { statut } = req.query;

  let query = `
    SELECT c.*, f.nom as fournisseur_nom,
      (SELECT COUNT(*) FROM commande_articles WHERE commande_id = c.id) as nb_lignes,
      (SELECT COALESCE(SUM(quantite * prix_unitaire), 0) FROM commande_articles WHERE commande_id = c.id) as total
    FROM commandes c
    LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
  `;
  const params = [];

  if (statut && statut !== 'tous') {
    query += ' WHERE c.statut = ?';
    params.push(statut);
  }

  query += ' ORDER BY c.id DESC';
  const commandes = db.prepare(query).all(...params);
  res.json({ commandes });
});

// POST /api/commandes
router.post('/', authenticate, (req, res) => {
  const db = req.db;
  const { fournisseur_id, notes, lignes } = req.body;

  if (!fournisseur_id) {
    return res.status(400).json({ error: 'Fournisseur requis.' });
  }
  if (!lignes || !lignes.length) {
    return res.status(400).json({ error: 'Au moins une ligne requise.' });
  }

  const insertCommande = db.prepare(`
    INSERT INTO commandes (fournisseur_id, statut, notes, date_commande)
    VALUES (?, 'brouillon', ?, datetime('now'))
  `);
  const insertLigne = db.prepare(`
    INSERT INTO commande_articles (commande_id, article_id, quantite, prix_unitaire)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    const result = insertCommande.run(fournisseur_id, notes || null);
    const commandeId = result.lastInsertRowid;

    for (const ligne of lignes) {
      insertLigne.run(commandeId, ligne.article_id, ligne.quantite || 1, ligne.prix_unitaire || 0);
    }

    return commandeId;
  });

  const commandeId = transaction();
  const commande = db.prepare('SELECT * FROM commandes WHERE id = ?').get(commandeId);
  res.status(201).json({ commande });
});

// GET /api/commandes/:id
router.get('/:id', authenticate, (req, res) => {
  const db = req.db;
  const commande = db.prepare(`
    SELECT c.*, f.nom as fournisseur_nom, f.telephone as fournisseur_telephone, f.email as fournisseur_email
    FROM commandes c
    LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });

  const lignes = db.prepare(`
    SELECT ca.*, a.reference, a.nom, a.unite, a.stock_actuel
    FROM commande_articles ca
    LEFT JOIN articles a ON ca.article_id = a.id
    WHERE ca.commande_id = ?
  `).all(req.params.id);

  res.json({ commande, lignes });
});

// PUT /api/commandes/:id (brouillon seulement)
router.put('/:id', authenticate, (req, res) => {
  const db = req.db;
  const commande = db.prepare('SELECT * FROM commandes WHERE id = ?').get(req.params.id);
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
  if (commande.statut !== 'brouillon') {
    return res.status(400).json({ error: 'Seules les commandes en brouillon peuvent etre modifiees.' });
  }

  const { fournisseur_id, notes, lignes } = req.body;

  const transaction = db.transaction(() => {
    if (fournisseur_id) {
      db.prepare('UPDATE commandes SET fournisseur_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(fournisseur_id, req.params.id);
    }
    if (notes !== undefined) {
      db.prepare('UPDATE commandes SET notes = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(notes, req.params.id);
    }
    if (lignes) {
      db.prepare('DELETE FROM commande_articles WHERE commande_id = ?').run(req.params.id);
      const insertLigne = db.prepare('INSERT INTO commande_articles (commande_id, article_id, quantite, prix_unitaire) VALUES (?, ?, ?, ?)');
      for (const ligne of lignes) {
        insertLigne.run(req.params.id, ligne.article_id, ligne.quantite || 1, ligne.prix_unitaire || 0);
      }
    }
  });

  transaction();

  // Re-query
  const updated = db.prepare('SELECT c.*, f.nom as fournisseur_nom FROM commandes c LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id WHERE c.id = ?').get(req.params.id);
  const lignesUpdated = db.prepare('SELECT ca.*, a.reference, a.nom FROM commande_articles ca LEFT JOIN articles a ON ca.article_id = a.id WHERE ca.commande_id = ?').all(req.params.id);
  res.json({ commande: updated, lignes: lignesUpdated });
});

// PATCH /api/commandes/:id/statut
router.patch('/:id/statut', authenticate, (req, res) => {
  const db = req.db;
  const { statut } = req.body;

  const validStatuts = ['brouillon', 'envoyee', 'recue', 'annulee'];
  if (!validStatuts.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }

  const commande = db.prepare('SELECT * FROM commandes WHERE id = ?').get(req.params.id);
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });

  const transaction = db.transaction(() => {
    if (statut === 'recue') {
      db.prepare('UPDATE commandes SET statut = ?, date_reception = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?')
        .run(statut, req.params.id);

      // Generer les mouvements d'entree pour chaque ligne
      const lignes = db.prepare('SELECT * FROM commande_articles WHERE commande_id = ?').all(req.params.id);
      const insertMouvement = db.prepare(`
        INSERT INTO mouvements (article_id, type, quantite, motif, user_id, fournisseur_id, commande_id, date)
        VALUES (?, 'entree', ?, 'Reception commande', ?, ?, ?, datetime('now'))
      `);
      const updateStock = db.prepare('UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime(\'now\') WHERE id = ?');

      for (const ligne of lignes) {
        insertMouvement.run(ligne.article_id, ligne.quantite, req.user.id, commande.fournisseur_id, req.params.id);
        updateStock.run(ligne.quantite, ligne.article_id);
      }
    } else {
      db.prepare('UPDATE commandes SET statut = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(statut, req.params.id);
    }
  });

  transaction();

  const updated = db.prepare('SELECT c.*, f.nom as fournisseur_nom FROM commandes c LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id WHERE c.id = ?').get(req.params.id);
  res.json({ commande: updated });
});

// DELETE /api/commandes/:id (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const commande = db.prepare('SELECT * FROM commandes WHERE id = ?').get(req.params.id);
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
  if (commande.statut === 'recue') {
    return res.status(400).json({ error: 'Impossible de supprimer une commande deja recue.' });
  }
  db.prepare('DELETE FROM commandes WHERE id = ?').run(req.params.id);
  res.json({ message: 'Commande supprimee.' });
});

module.exports = router;
