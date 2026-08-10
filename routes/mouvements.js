// routes/mouvements.js
const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkOverlap, recordSerie, validerSouche, quantiteDepuisSouche } = require('../services/series');
const { logAudit } = require('../services/audit');
const router = express.Router();

// GET /api/mouvements/resume — vue Inventaire simplifiee : par article,
// total entrees / total sorties / stock reel actuel.
router.get('/resume', authenticate, (req, res) => {
  const db = req.db;
  const lignes = db.prepare(`
    SELECT a.id AS article_id, a.nom AS article_nom, a.reference, a.unite,
           a.stock_actuel, a.stock_min,
           COALESCE((SELECT SUM(m.quantite) FROM mouvements m WHERE m.article_id = a.id AND m.type = 'entree'), 0) AS total_entrees,
           COALESCE((SELECT SUM(m.quantite) FROM mouvements m WHERE m.article_id = a.id AND m.type = 'sortie'), 0) AS total_sorties
    FROM articles a
    ORDER BY a.nom ASC
  `).all();

  const totaux = lignes.reduce((acc, l) => {
    acc.total_entrees += l.total_entrees;
    acc.total_sorties += l.total_sorties;
    acc.stock_reel += l.stock_actuel;
    return acc;
  }, { total_entrees: 0, total_sorties: 0, stock_reel: 0 });

  res.json({ lignes, totaux });
});

// GET /api/mouvements
router.get('/', authenticate, (req, res) => {
  const db = req.db;
  const { debut, fin, type, article_id, offset } = req.query;

  let whereClause = 'WHERE 1=1';
  const params = [];

  if (debut) { whereClause += ' AND m.date >= ?'; params.push(debut); }
  if (fin) { whereClause += ' AND m.date <= ?'; params.push(fin + ' 23:59:59'); }
  if (type) { whereClause += ' AND m.type = ?'; params.push(type); }
  if (article_id) { whereClause += ' AND m.article_id = ?'; params.push(article_id); }

  const limit = 50;
  const off = parseInt(offset, 10) || 0;

  const mouvements = db.prepare(`
    SELECT m.*, a.nom as article_nom, a.reference as article_reference,
           u.username, f.nom as fournisseur_nom,
           l.nom as localite_nom, fr.reference as fiche_reference,
           fr.statut as fiche_statut
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN fournisseurs f ON m.fournisseur_id = f.id
    LEFT JOIN localites l ON m.localite_id = l.id
    LEFT JOIN fiches_reception fr ON m.fiche_id = fr.id
    ${whereClause}
    ORDER BY m.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, off);

  // Totals
  let totalsWhere = 'WHERE 1=1';
  const totalsParams = [];
  if (debut) { totalsWhere += ' AND date >= ?'; totalsParams.push(debut); }
  if (fin) { totalsWhere += ' AND date <= ?'; totalsParams.push(fin + ' 23:59:59'); }
  if (article_id) { totalsWhere += ' AND article_id = ?'; totalsParams.push(article_id); }

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'entree' THEN quantite ELSE 0 END), 0) as total_entrees,
      COALESCE(SUM(CASE WHEN type = 'sortie' THEN quantite ELSE 0 END), 0) as total_sorties
    FROM mouvements
    ${totalsWhere}
  `).get(...totalsParams);

  res.json({ mouvements, totals });
});

// POST /api/mouvements — mouvement générique (admin seulement).
// L'UI ne l'utilise plus : les entrées/sorties passent par les fiches (photos/impression).
// Le restreindre empeche de modifier le stock hors des flux metier.
router.post('/', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { article_id, type, quantite, motif, demandeur, fournisseur_id } = req.body;

  if (!article_id || !type || !quantite) {
    return res.status(400).json({ error: 'Article, type et quantite requis.' });
  }

  if (!['entree', 'sortie'].includes(type)) {
    return res.status(400).json({ error: 'Type doit etre entree ou sortie.' });
  }

  const qte = parseInt(quantite, 10);
  if (isNaN(qte) || qte <= 0) {
    return res.status(400).json({ error: 'La quantite doit etre un nombre positif.' });
  }

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(article_id);
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  // Verifier stock suffisant pour les sorties
  if (type === 'sortie' && article.stock_actuel < qte) {
    return res.status(400).json({
      error: 'Stock insuffisant. Stock actuel : ' + article.stock_actuel + ' ' + article.unite
    });
  }

  // Verifier le fournisseur si fourni
  if (fournisseur_id) {
    const fournisseur = db.prepare('SELECT id FROM fournisseurs WHERE id = ?').get(fournisseur_id);
    if (!fournisseur) return res.status(400).json({ error: 'Fournisseur introuvable.' });
  }

  let mouvement = null;
  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO mouvements (article_id, type, quantite, motif, demandeur, user_id, fournisseur_id, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))
    `).run(article_id, type, qte, motif || null, demandeur || null, req.user.id, fournisseur_id || null);

    const delta = type === 'entree' ? qte : -qte;
    db.prepare('UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
      .run(delta, article_id);

    mouvement = db.prepare(`
      SELECT m.*, a.nom as article_nom, u.username
      FROM mouvements m
      LEFT JOIN articles a ON m.article_id = a.id
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);
  });

  transaction();
  res.status(201).json({ mouvement });
});

// GET /api/mouvements/anomalies — mouvements d'articles numerotes sans plage de
// numeros valide (essentiellement issus de l'import historique).
router.get('/anomalies', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const anomalies = db.prepare(`
    SELECT m.id, m.date, m.type, m.quantite, m.motif, a.id as article_id, a.nom as article_nom, l.nom as localite_nom
    FROM mouvements m
    JOIN articles a ON m.article_id = a.id
    LEFT JOIN localites l ON m.localite_id = l.id
    WHERE a.type_article = 'numerote' AND (m.numero_debut IS NULL OR m.numero_fin IS NULL)
      AND (m.motif IS NULL OR m.motif != 'Retour non utilise — remis en stock')
    ORDER BY m.date ASC, m.id ASC
    LIMIT 500
  `).all();
  res.json({ anomalies });
});

// GET /api/mouvements/anomalies-souches — mouvements d'articles numerotes dont la
// plage de souches est PRESENTE mais INVALIDE : debut > fin, ou etendue non multiple
// exact de la taille de lot de la categorie. Pour correction manuelle admin.
router.get('/anomalies-souches', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const anomalies = db.prepare(`
    SELECT m.id, m.date, m.type, m.quantite, m.numero_debut, m.numero_fin,
      a.id as article_id, a.nom as article_nom, c.name as categorie, c.souches_par_unite as lot,
      l.nom as localite_nom
    FROM mouvements m
    JOIN articles a ON m.article_id = a.id
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN localites l ON m.localite_id = l.id
    WHERE a.type_article = 'numerote'
      AND m.numero_debut IS NOT NULL AND TRIM(m.numero_debut) != ''
      AND m.numero_fin IS NOT NULL AND TRIM(m.numero_fin) != ''
      AND (
        CAST(m.numero_debut AS INTEGER) > CAST(m.numero_fin AS INTEGER)
        OR (c.souches_par_unite IS NOT NULL
            AND ((CAST(m.numero_fin AS INTEGER) - CAST(m.numero_debut AS INTEGER) + 1) % c.souches_par_unite) != 0)
      )
    ORDER BY m.date ASC, m.id ASC
    LIMIT 500
  `).all();
  // Annoter chaque anomalie de la raison exacte.
  anomalies.forEach(a => {
    const d = parseInt(a.numero_debut, 10), f = parseInt(a.numero_fin, 10);
    if (d > f) a.raison = 'Début (' + a.numero_debut + ') > fin (' + a.numero_fin + ')';
    else if (a.lot) a.raison = 'Plage de ' + (f - d + 1) + ' n\'est pas un multiple de ' + a.lot;
    else a.raison = 'Plage suspecte';
  });
  res.json({ anomalies });
});

// PATCH /api/mouvements/:id/souche — correction manuelle admin d'une plage INVALIDE.
// Valide strictement la nouvelle plage (multiple de la taille de lot), verifie le
// chevauchement, met a jour le mouvement + la serie correspondante, et ajuste le
// stock du delta de quantite (une correction de plage peut changer la quantite reelle).
router.patch('/:id/souche', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { numero_debut, numero_fin } = req.body;

  const mvt = db.prepare(`
    SELECT m.*, a.type_article, a.nom as article_nom, a.souche_par_localite, c.souches_par_unite as lot
    FROM mouvements m JOIN articles a ON m.article_id = a.id
    LEFT JOIN categories c ON a.categorie_id = c.id WHERE m.id = ?
  `).get(req.params.id);
  if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
  if (mvt.type_article !== 'numerote') return res.status(400).json({ error: 'Article non numeroté.' });

  const v = validerSouche(mvt.lot, numero_debut, numero_fin);
  if (!v.ok) return res.status(400).json({ error: v.raison });

  const oldDebut = mvt.numero_debut, oldFin = mvt.numero_fin, oldQte = mvt.quantite;
  const newQte = mvt.lot ? quantiteDepuisSouche(mvt.lot, numero_debut, numero_fin) : oldQte;

  try {
    const transaction = db.transaction(() => {
      // Chevauchement (hors la plage actuelle de ce mouvement, qu'on remplace).
      const overlap = checkOverlap(db, mvt.article_id, numero_debut, numero_fin,
        mvt.type === 'entree' ? 'entree' : 'sortie',
        { localite_id: mvt.localite_id, perLocalite: !!mvt.souche_par_localite });
      if (overlap && !(String(overlap.numero_debut) === String(oldDebut) && String(overlap.numero_fin) === String(oldFin))) {
        throw new Error('Chevauchement : plage ' + numero_debut + '-' + numero_fin + ' déjà enregistrée (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');
      }

      db.prepare('UPDATE mouvements SET numero_debut = ?, numero_fin = ?, quantite = ? WHERE id = ?')
        .run(String(numero_debut), String(numero_fin), newQte, req.params.id);

      // Met a jour la serie correspondante (meme article + ancienne plage exacte).
      db.prepare(`
        UPDATE series_numeros SET numero_debut = ?, numero_fin = ?, quantite = ?
        WHERE article_id = ? AND source_type = ? AND numero_debut = ? AND numero_fin = ?
      `).run(String(numero_debut), String(numero_fin), newQte, mvt.article_id,
        mvt.type === 'entree' ? 'entree' : 'sortie', String(oldDebut), String(oldFin));

      // Met a jour la ligne de fiche liee (si presente) pour coherence d'affichage.
      if (mvt.fiche_id) {
        db.prepare(`
          UPDATE fiche_reception_articles SET numero_debut = ?, numero_fin = ?, quantite = ?
          WHERE fiche_id = ? AND article_id = ? AND numero_debut = ? AND numero_fin = ?
        `).run(String(numero_debut), String(numero_fin), newQte, mvt.fiche_id, mvt.article_id, String(oldDebut), String(oldFin));
      }

      // Ajuste le stock du delta (entree: +delta ; sortie: -delta).
      const delta = newQte - oldQte;
      if (delta !== 0) {
        const signe = mvt.type === 'entree' ? 1 : -1;
        db.prepare("UPDATE articles SET stock_actuel = stock_actuel + ?, updated_at = datetime('now','localtime') WHERE id = ?")
          .run(signe * delta, mvt.article_id);
      }
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  logAudit(db, req.user.id, req.user.username, 'CORRIGER_SOUCHE',
    mvt.article_nom + ' — mvt #' + req.params.id + ' : ' + oldDebut + '-' + oldFin + ' -> ' + numero_debut + '-' + numero_fin + (newQte !== oldQte ? ' (qté ' + oldQte + '->' + newQte + ')' : ''));
  res.json({ mouvement: db.prepare('SELECT * FROM mouvements WHERE id = ?').get(req.params.id) });
});

// PATCH /api/mouvements/:id/numero — correction manuelle admin d'une plage manquante
router.patch('/:id/numero', authenticate, requireAdmin, (req, res) => {
  const db = req.db;
  const { numero_debut, numero_fin } = req.body;

  const mvt = db.prepare('SELECT m.*, a.type_article, a.nom as article_nom FROM mouvements m JOIN articles a ON m.article_id = a.id WHERE m.id = ?').get(req.params.id);
  if (!mvt) return res.status(404).json({ error: 'Mouvement introuvable.' });
  if (mvt.numero_debut || mvt.numero_fin) return res.status(400).json({ error: 'Ce mouvement a deja une plage de numeros enregistree.' });

  try {
    const transaction = db.transaction(() => {
      const overlap = checkOverlap(db, mvt.article_id, numero_debut, numero_fin, mvt.type === 'entree' ? 'entree' : 'sortie');
      if (overlap) throw new Error('Chevauchement pour ' + mvt.article_nom + ' : plage ' + numero_debut + '-' + numero_fin + ' deja enregistree (' + overlap.numero_debut + '-' + overlap.numero_fin + ').');

      db.prepare('UPDATE mouvements SET numero_debut = ?, numero_fin = ? WHERE id = ?').run(String(numero_debut), String(numero_fin), req.params.id);
      recordSerie(db, mvt.article_id, numero_debut, numero_fin, mvt.quantite, mvt.type === 'entree' ? 'entree' : 'sortie', req.params.id);
    });
    transaction();
  } catch (err) {
    if (err.code && err.code.startsWith('SQLITE_')) throw err;
    return res.status(400).json({ error: err.message });
  }

  logAudit(db, req.user.id, req.user.username, 'CORRIGER_NUMERO', mvt.article_nom + ' — mouvement #' + req.params.id + ' -> ' + numero_debut + '-' + numero_fin);
  const updated = db.prepare('SELECT * FROM mouvements WHERE id = ?').get(req.params.id);
  res.json({ mouvement: updated });
});

module.exports = router;
