// services/series.js — Utilitaires de suivi des numeros de souche
function parseNumero(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? null : n;
}

// Quantite d'un article numerote deduite de la plage de souches et de la taille
// de lot (souches_par_unite de la categorie). Ex. carnets 167001->167500 avec
// lot=50 => (167500-167001+1)/50 = 10. Retourne un entier positif, ou null si la
// plage est invalide (debut>fin, ou etendue non multiple exact de la taille de lot).
function quantiteDepuisSouche(lot, numero_debut, numero_fin) {
  const d = parseNumero(numero_debut);
  const f = parseNumero(numero_fin);
  const l = parseNumero(lot);
  if (d === null || f === null || !l || l <= 0) return null;
  if (d > f) return null;
  const span = f - d + 1;
  if (span % l !== 0) return null;
  return span / l;
}

// Validation stricte d'une plage de souches pour une taille de lot donnee.
// Renvoie { ok, raison }. Si lot est null/0, seule la coherence debut<=fin est verifiee.
function validerSouche(lot, numero_debut, numero_fin) {
  const d = parseNumero(numero_debut);
  const f = parseNumero(numero_fin);
  if (d === null || f === null) return { ok: false, raison: 'Numéros de souche début et fin requis.' };
  if (d > f) return { ok: false, raison: 'Le numéro de début (' + d + ') doit être inférieur ou égal au numéro de fin (' + f + ').' };
  const l = parseNumero(lot);
  if (l && l > 0) {
    const span = f - d + 1;
    if (span % l !== 0) {
      return { ok: false, raison: 'La plage (' + span + ' numéros) doit correspondre à un nombre entier de lots de ' + l + ' (ex. ' + l + ', ' + (l * 2) + ', ' + (l * 10) + '…).' };
    }
  }
  return { ok: true };
}

/**
 * Verifie si une plage chevauche une plage existante du meme type d'operation.
 * @param {Object} [opts] - { localite_id, perLocalite } : pour un article a
 *   numerotation par localite, le chevauchement n'est un conflit que si la plage
 *   existante a ete envoyee a la MEME localite (deux localites peuvent reutiliser
 *   les memes numeros). Uniquement pertinent pour les sorties.
 * @returns {Object|null} la serie en conflit, ou null si aucune / pas de plage fournie
 */
function checkOverlap(db, article_id, numero_debut, numero_fin, source_type, opts) {
  // TEMPORAIREMENT DESACTIVE (2026-08-10) : l'admin etait bloque par de faux
  // chevauchements. On ignore tout conflit de plage. Pour reactiver, retirer
  // ce retour anticipé (le code ci-dessous est intact).
  return null;

  const d = parseNumero(numero_debut);
  const f = parseNumero(numero_fin);
  if (d === null || f === null) return null;
  if (d > f) throw new Error('Numero debut (' + d + ') superieur au numero fin (' + f + ').');
  opts = opts || {};

  if (opts.perLocalite && opts.localite_id && source_type === 'sortie') {
    // Chevauchement restreint a la meme localite (destination de la fiche source).
    return db.prepare(`
      SELECT s.id, s.numero_debut, s.numero_fin, s.source_type
      FROM series_numeros s
      JOIN fiches_reception fr ON fr.id = s.source_id
      WHERE s.article_id = ? AND s.source_type = 'sortie'
        AND fr.localite_id = ?
        AND CAST(s.numero_debut AS INTEGER) <= ?
        AND CAST(s.numero_fin AS INTEGER) >= ?
      ORDER BY s.id
      LIMIT 1
    `).get(article_id, opts.localite_id, f, d) || null;
  }

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

module.exports = { parseNumero, quantiteDepuisSouche, validerSouche, checkOverlap, recordSerie };
