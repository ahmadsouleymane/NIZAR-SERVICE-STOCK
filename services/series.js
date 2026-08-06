// services/series.js — Utilitaires de suivi des numeros de souche
function parseNumero(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? null : n;
}

/**
 * Verifie si une plage chevauche une plage existante du meme type d'operation
 * @returns {Object|null} la serie en conflit, ou null si aucune / pas de plage fournie
 */
function checkOverlap(db, article_id, numero_debut, numero_fin, source_type) {
  const d = parseNumero(numero_debut);
  const f = parseNumero(numero_fin);
  if (d === null || f === null) return null;
  if (d > f) throw new Error('Numero debut (' + d + ') superieur au numero fin (' + f + ').');
  return db.prepare(`
    SELECT s.id, s.numero_debut, s.numero_fin, s.source_type
    FROM series_numeros s
    WHERE s.article_id = ? AND s.source_type = ?
      AND CAST(s.numero_debut AS INTEGER) <= ?
      AND CAST(s.numero_fin AS INTEGER) >= ?
    ORDER BY s.id
    LIMIT 1
  `).get(article_id, source_type, f, d) || null;
}

/**
 * Enregistre une plage dans series_numeros (no-op si pas de plage valide)
 */
function recordSerie(db, article_id, numero_debut, numero_fin, quantite, source_type, source_id) {
  const d = parseNumero(numero_debut);
  const f = parseNumero(numero_fin);
  if (d === null || f === null) return;
  db.prepare(`
    INSERT INTO series_numeros (article_id, numero_debut, numero_fin, quantite, source_type, source_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(article_id, String(d), String(f), quantite, source_type, source_id);
}

module.exports = { parseNumero, checkOverlap, recordSerie };
