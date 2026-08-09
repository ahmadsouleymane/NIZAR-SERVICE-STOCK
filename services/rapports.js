// services/rapports.js — Moteur d'agrégation du centre de rapports
// Génère des requêtes GROUP BY à partir d'une dimension (jour, mois, article,
// catégorie, agence, fournisseur, type, utilisateur) et de filtres validés.
// Fournit aussi les builders d'export Excel (ExcelJS) et CSV dans la charte Nizar.

const ExcelJS = require('exceljs');

// === Erreur HTTP pilotable (réponse 4xx propre) ===
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// === Palette Nizar (charte graphique) ===
const NIZAR = {
  noir: '111827',        // accent secondaire de marque
  turquoise: '0EA5A0',   // accent principal
  turquoiseFonce: '0B8A86',
  infoBg: 'E6F5F4',      // fond turquoise clair (alternance)
  gris: 'F3F4F6',        // fond total
  bordure: 'E5E7EB',
  texteMuted: '6B7280'
};

// === Utilitaires dates ===
function pad(n) { return String(n).padStart(2, '0'); }
function isoDay(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}
function todayISO() { return isoDay(new Date()); }

// === Validation ===
function intOrUndef(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
function cleanDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : undefined;
}
function sanitizeQuery(q) {
  return {
    debut: cleanDate(q && q.debut),
    fin: cleanDate(q && q.fin),
    article_id: intOrUndef(q && q.article_id),
    categorie_id: intOrUndef(q && q.categorie_id),
    localite_id: intOrUndef(q && q.localite_id),
    fournisseur_id: intOrUndef(q && q.fournisseur_id),
    user_id: intOrUndef(q && q.user_id),
    type: (q && q.type === 'entree') || (q && q.type === 'sortie') ? q.type : undefined,
    group_by: q && q.group_by ? String(q.group_by) : undefined,
    // limit : valeur positive ≤ 50, ou null pour « tout » (absent, 0 ou 'all')
    limit: (q && q.limit && q.limit !== '0' && q.limit !== 'all') ? (intOrUndef(q.limit) || null) : null,
    stock_min_jours: intOrUndef(q && q.stock_min_jours) || 30,
    jours: intOrUndef(q && q.jours) || 90
  };
}

// === Dimensions ===
const MOUVEMENT_DIMENSIONS = {
  jour:        { label: 'Jour',       select: "date(m.date) AS libelle", group: "date(m.date)", order: "date(m.date) ASC" },
  mois:        { label: 'Mois',       select: "strftime('%Y-%m', m.date) AS libelle", group: "strftime('%Y-%m', m.date)", order: "strftime('%Y-%m', m.date) ASC" },
  article:     { label: 'Article',    select: "COALESCE(a.nom,'(sans article)') AS libelle", group: "COALESCE(a.nom,'(sans article)')", order: "COALESCE(a.nom,'(sans article)') ASC" },
  categorie:   { label: 'Catégorie',  select: "COALESCE(c.name,'(sans catégorie)') AS libelle", group: "COALESCE(c.name,'(sans catégorie)')", order: "COALESCE(c.name,'(sans catégorie)') ASC" },
  localite:    { label: 'Agence',     select: "COALESCE(l.nom,'(sans agence)') AS libelle", group: "COALESCE(l.nom,'(sans agence)')", order: "COALESCE(l.nom,'(sans agence)') ASC" },
  fournisseur: { label: 'Fournisseur', select: "COALESCE(f.nom,'(sans fournisseur)') AS libelle", group: "COALESCE(f.nom,'(sans fournisseur)')", order: "COALESCE(f.nom,'(sans fournisseur)') ASC" },
  type:        { label: 'Type',       select: "CASE WHEN m.type='entree' THEN 'Entrée' WHEN m.type='sortie' THEN 'Sortie' ELSE m.type END AS libelle", group: "m.type", order: "m.type ASC" },
  utilisateur: { label: 'Utilisateur', select: "COALESCE(u.username,'(inconnu)') AS libelle", group: "COALESCE(u.username,'(inconnu)')", order: "COALESCE(u.username,'(inconnu)') ASC" }
};

const STOCK_DIMENSIONS = {
  categorie:   { label: 'Catégorie',  select: "COALESCE(c.name,'(sans catégorie)') AS libelle", group: "COALESCE(c.name,'(sans catégorie)')", order: "valeur DESC" },
  fournisseur: { label: 'Fournisseur', select: "COALESCE(f.nom,'(sans fournisseur)') AS libelle", group: "COALESCE(f.nom,'(sans fournisseur)')", order: "valeur DESC" },
  type:        { label: 'Type article', select: "CASE WHEN a.type_article='numerote' THEN 'Numéroté' ELSE 'Standard' END AS libelle", group: "a.type_article", order: "libelle ASC" },
  unite:       { label: 'Unité',      select: "COALESCE(a.unite,'-') AS libelle", group: "COALESCE(a.unite,'-')", order: "libelle ASC" }
};

function resolveDimension(map, name, fallback) {
  if (!name) return map[fallback];
  if (!map[name]) throw new HttpError(400, 'Regroupement inconnu : ' + name + '. Valeurs acceptées : ' + Object.keys(map).join(', '));
  return map[name];
}

// === Filtres mouvements ===
function buildMovementFilters(opts) {
  let where = 'WHERE 1=1';
  const params = [];
  if (opts.debut) { where += ' AND m.date >= ?'; params.push(opts.debut); }
  if (opts.fin) { where += ' AND m.date <= ?'; params.push(opts.fin + ' 23:59:59'); }
  if (opts.article_id) { where += ' AND m.article_id = ?'; params.push(opts.article_id); }
  if (opts.categorie_id) { where += ' AND a.categorie_id = ?'; params.push(opts.categorie_id); }
  if (opts.localite_id) { where += ' AND m.localite_id = ?'; params.push(opts.localite_id); }
  if (opts.fournisseur_id) { where += ' AND m.fournisseur_id = ?'; params.push(opts.fournisseur_id); }
  if (opts.user_id) { where += ' AND m.user_id = ?'; params.push(opts.user_id); }
  if (opts.type) { where += ' AND m.type = ?'; params.push(opts.type); }
  return { where, params };
}

const MOUVEMENT_METRICS = `
  COUNT(*) AS nb,
  COALESCE(SUM(CASE WHEN m.type='entree' THEN m.quantite ELSE 0 END),0) AS entrees,
  COALESCE(SUM(CASE WHEN m.type='sortie' THEN m.quantite ELSE 0 END),0) AS sorties,
  COALESCE(SUM(m.quantite),0) AS quantite_totale,
  COALESCE(SUM(CASE WHEN m.type='entree' THEN m.quantite*COALESCE(a.prix_unitaire,0) ELSE 0 END),0) AS valeur_entrees,
  COALESCE(SUM(CASE WHEN m.type='sortie' THEN m.quantite*COALESCE(a.prix_unitaire,0) ELSE 0 END),0) AS valeur_sorties`;

function emptyPeriodRow(key) {
  return { libelle: key, nb: 0, entrees: 0, sorties: 0, quantite_totale: 0, valeur_entrees: 0, valeur_sorties: 0, solde: 0, valeur: 0 };
}

function fillPeriod(rows, groupBy, debut, fin) {
  const d0 = new Date(debut + 'T00:00:00');
  const d1 = new Date(fin + 'T00:00:00');
  if (isNaN(d0.getTime()) || isNaN(d1.getTime()) || d0 > d1) return rows;
  const map = {};
  rows.forEach(r => { map[r.libelle] = r; });
  const out = [];
  const cur = new Date(d0);
  if (groupBy === 'jour') {
    while (cur <= d1) {
      const k = isoDay(cur);
      out.push(map[k] || emptyPeriodRow(k));
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // Itère sur les premiers jours de chaque mois (borné par mois(debut)..mois(fin))
    const startMonth = new Date(d0.getFullYear(), d0.getMonth(), 1);
    const endMonth = new Date(d1.getFullYear(), d1.getMonth(), 1);
    const m = new Date(startMonth);
    while (m <= endMonth) {
      const k = monthKey(m);
      out.push(map[k] || emptyPeriodRow(k));
      m.setMonth(m.getMonth() + 1);
    }
  }
  return out;
}

// === Agrégations ===

// Mouvements génériques : dimension × filtres → lignes regroupées (séries temporelles comblées)
function aggregateMouvements(db, opts) {
  const dim = resolveDimension(MOUVEMENT_DIMENSIONS, opts.group_by, 'mois');
  const filters = buildMovementFilters(opts);
  const sql = `
    SELECT ${dim.select}, ${MOUVEMENT_METRICS}
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN localites l ON m.localite_id = l.id
    LEFT JOIN fournisseurs f ON m.fournisseur_id = f.id
    LEFT JOIN users u ON m.user_id = u.id
    ${filters.where}
    GROUP BY ${dim.group}
    ORDER BY ${dim.order}`;
  let rows = db.prepare(sql).all(...filters.params);
  rows = rows.map(r => ({ ...r, solde: r.entrees - r.sorties, valeur: r.valeur_entrees - r.valeur_sorties }));
  if ((opts.group_by === 'jour' || opts.group_by === 'mois') && opts.debut && opts.fin) {
    rows = fillPeriod(rows, opts.group_by, opts.debut, opts.fin);
  }
  return rows;
}

function movementTotals(rows) {
  const t = { nb: 0, entrees: 0, sorties: 0, quantite_totale: 0, valeur_entrees: 0, valeur_sorties: 0, solde: 0, valeur: 0 };
  for (const r of rows) {
    t.nb += r.nb; t.entrees += r.entrees; t.sorties += r.sorties;
    t.quantite_totale += r.quantite_totale; t.valeur_entrees += r.valeur_entrees;
    t.valeur_sorties += r.valeur_sorties;
  }
  t.solde = t.entrees - t.sorties;
  t.valeur = t.valeur_entrees - t.valeur_sorties;
  return t;
}

// Ventilation du stock par dimension (catégorie / fournisseur / type / unité)
function ventilationStock(db, opts) {
  const dim = resolveDimension(STOCK_DIMENSIONS, opts.group_by, 'categorie');
  let where = 'WHERE 1=1';
  const params = [];
  if (opts.categorie_id) { where += ' AND a.categorie_id = ?'; params.push(opts.categorie_id); }
  if (opts.fournisseur_id) { where += ' AND a.fournisseur_id = ?'; params.push(opts.fournisseur_id); }
  if (opts.type) { where += ' AND a.type_article = ?'; params.push(opts.type); }
  const sql = `
    SELECT ${dim.select},
      COUNT(*) AS nb_articles,
      COALESCE(SUM(a.stock_actuel),0) AS stock_actuel,
      COALESCE(SUM(a.stock_actuel * COALESCE(a.prix_unitaire,0)),0) AS valeur,
      SUM(CASE WHEN a.stock_actuel <= 0 THEN 1 ELSE 0 END) AS nb_ruptures,
      SUM(CASE WHEN a.stock_actuel > 0 AND a.stock_actuel <= a.stock_min THEN 1 ELSE 0 END) AS nb_alertes
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    ${where}
    GROUP BY ${dim.group}
    ORDER BY ${dim.order}`;
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({ ...r, nb_ruptures: r.nb_ruptures || 0, nb_alertes: r.nb_alertes || 0 }));
}

function stockTotals(rows) {
  const t = { nb_articles: 0, stock_actuel: 0, valeur: 0, nb_ruptures: 0, nb_alertes: 0 };
  for (const r of rows) {
    t.nb_articles += r.nb_articles; t.stock_actuel += r.stock_actuel;
    t.valeur += r.valeur; t.nb_ruptures += r.nb_ruptures; t.nb_alertes += r.nb_alertes;
  }
  return t;
}

// Consommation : sorties regroupées (article / mois / agence), top-N optionnel
function consommation(db, opts) {
  const dim = opts.group_by === 'mois'
    ? MOUVEMENT_DIMENSIONS.mois
    : opts.group_by === 'localite' ? MOUVEMENT_DIMENSIONS.localite
    : { label: 'Article', select: "COALESCE(a.nom,'(sans article)') AS libelle", group: "COALESCE(a.nom,'(sans article)')", order: "quantite DESC" };
  const filters = buildMovementFilters({ ...opts, type: 'sortie' });
  const limit = opts.limit && opts.limit > 0 && opts.limit <= 50 ? opts.limit : null;
  const sql = `
    SELECT ${dim.select},
      COALESCE(SUM(m.quantite),0) AS quantite,
      COALESCE(SUM(m.quantite * COALESCE(a.prix_unitaire,0)),0) AS valeur,
      COUNT(*) AS nb_mouvements
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN localites l ON m.localite_id = l.id
    ${filters.where}
    GROUP BY ${dim.group}
    ORDER BY quantite DESC
    ${limit ? 'LIMIT ' + limit : ''}`;
  return db.prepare(sql).all(...filters.params);
}

// Sorties par agence : résumé par agence + détail agence × article
function sortiesAgence(db, opts) {
  const filters = buildMovementFilters({ ...opts, type: 'sortie' });
  const resume = db.prepare(`
    SELECT COALESCE(l.nom,'(sans agence)') AS libelle,
      COUNT(*) AS nb_mouvements,
      COALESCE(SUM(m.quantite),0) AS quantite,
      COALESCE(SUM(m.quantite * COALESCE(a.prix_unitaire,0)),0) AS valeur
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN localites l ON m.localite_id = l.id
    ${filters.where}
    GROUP BY COALESCE(l.nom,'(sans agence)')
    ORDER BY valeur DESC`).all(...filters.params);
  const detail = db.prepare(`
    SELECT COALESCE(l.nom,'(sans agence)') AS localite,
      a.reference, COALESCE(a.nom,'(sans article)') AS article, a.unite,
      COALESCE(SUM(m.quantite),0) AS quantite,
      COALESCE(a.prix_unitaire,0) AS prix_unitaire,
      COALESCE(SUM(m.quantite * COALESCE(a.prix_unitaire,0)),0) AS valeur
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    LEFT JOIN localites l ON m.localite_id = l.id
    ${filters.where}
    GROUP BY COALESCE(l.nom,'(sans agence)'), m.article_id
    ORDER BY localite ASC, quantite DESC`).all(...filters.params);
  return { resume, detail };
}

// Entrées fournisseur (fiches_entree) regroupées par fournisseur ou mois
function entreesFournisseurs(db, opts) {
  const by = opts.group_by === 'mois'
    ? "strftime('%Y-%m', fe.date_entree)"
    : "COALESCE(f.nom,'(sans fournisseur)')";
  let where = 'WHERE 1=1';
  const params = [];
  if (opts.debut) { where += ' AND fe.date_entree >= ?'; params.push(opts.debut); }
  if (opts.fin) { where += ' AND fe.date_entree <= ?'; params.push(opts.fin + ' 23:59:59'); }
  if (opts.fournisseur_id) { where += ' AND fe.fournisseur_id = ?'; params.push(opts.fournisseur_id); }
  const sql = `
    SELECT ${by} AS libelle,
      COUNT(DISTINCT fe.id) AS nb_fiches,
      COALESCE(SUM(fea.quantite),0) AS quantite,
      COALESCE(SUM(fea.quantite * COALESCE(a.prix_unitaire,0)),0) AS valeur
    FROM fiches_entree fe
    LEFT JOIN fiche_entree_articles fea ON fea.fiche_id = fe.id
    LEFT JOIN articles a ON fea.article_id = a.id
    LEFT JOIN fournisseurs f ON fe.fournisseur_id = f.id
    ${where}
    GROUP BY ${by}
    ORDER BY valeur DESC`;
  return db.prepare(sql).all(...params);
}

// Commandes : volume + délai moyen de réception par fournisseur ou statut
function commandes(db, opts) {
  const by = opts.group_by === 'statut'
    ? "CASE co.statut WHEN 'brouillon' THEN 'Brouillon' WHEN 'envoyee' THEN 'Envoyée' WHEN 'recue' THEN 'Reçue' ELSE 'Annulée' END"
    : "COALESCE(f.nom,'(sans fournisseur)')";
  let where = 'WHERE 1=1';
  const params = [];
  if (opts.debut) { where += ' AND co.date_commande >= ?'; params.push(opts.debut); }
  if (opts.fin) { where += ' AND co.date_commande <= ?'; params.push(opts.fin + ' 23:59:59'); }
  if (opts.fournisseur_id) { where += ' AND co.fournisseur_id = ?'; params.push(opts.fournisseur_id); }
  const sql = `
    SELECT ${by} AS libelle,
      COUNT(DISTINCT co.id) AS nb_commandes,
      COALESCE(SUM(ca.quantite),0) AS quantite,
      COALESCE(AVG(CASE WHEN co.statut='recue' AND co.date_reception IS NOT NULL
        THEN julianday(co.date_reception) - julianday(co.date_commande) END),0) AS delai_moyen_j
    FROM commandes co
    LEFT JOIN fournisseurs f ON co.fournisseur_id = f.id
    LEFT JOIN commande_articles ca ON ca.commande_id = co.id
    ${where}
    GROUP BY ${by}
    ORDER BY nb_commandes DESC`;
  return db.prepare(sql).all(...params);
}

// Retours de carnets par agence / type / article
function retours(db, opts) {
  const dim = opts.group_by === 'type'
    ? { label: 'Type', select: "CASE rc.type_retour WHEN 'usage' THEN 'Usage' ELSE 'Non utilisé' END AS libelle", group: "rc.type_retour", order: "libelle ASC" }
    : opts.group_by === 'article'
    ? { label: 'Article', select: "COALESCE(a.nom,'(sans article)') AS libelle", group: "COALESCE(a.nom,'(sans article)')", order: "quantite DESC" }
    : { label: 'Agence', select: "COALESCE(l.nom,'(sans agence)') AS libelle", group: "COALESCE(l.nom,'(sans agence)')", order: "quantite DESC" };
  let where = 'WHERE 1=1';
  const params = [];
  if (opts.debut) { where += ' AND rc.date_retour >= ?'; params.push(opts.debut); }
  if (opts.fin) { where += ' AND rc.date_retour <= ?'; params.push(opts.fin + ' 23:59:59'); }
  if (opts.localite_id) { where += ' AND rc.localite_id = ?'; params.push(opts.localite_id); }
  if (opts.type_retour) { where += ' AND rc.type_retour = ?'; params.push(opts.type_retour); }
  const sql = `
    SELECT ${dim.select},
      COUNT(*) AS nb,
      COALESCE(SUM(rc.quantite),0) AS quantite,
      SUM(CASE WHEN rc.type_retour='usage' THEN 1 ELSE 0 END) AS nb_usage,
      SUM(CASE WHEN rc.type_retour='non_utilise' THEN 1 ELSE 0 END) AS nb_non_utilise
    FROM retours_carnets rc
    LEFT JOIN articles a ON rc.article_id = a.id
    LEFT JOIN localites l ON rc.localite_id = l.id
    ${where}
    GROUP BY ${dim.group}
    ORDER BY ${dim.order}`;
  return db.prepare(sql).all(...params);
}

// Inventaires : écarts stock théorique vs compté
function inventaires(db, opts) {
  const dim = opts.group_by === 'utilisateur'
    ? { label: 'Utilisateur', select: "COALESCE(u.username,'(inconnu)') AS libelle", group: "COALESCE(u.username,'(inconnu)')", order: "valeur_ecart DESC" }
    : { label: 'Article', select: "COALESCE(a.nom,'(sans article)') AS libelle", group: "COALESCE(a.nom,'(sans article)')", order: "valeur_ecart DESC" };
  let where = 'WHERE 1=1';
  const params = [];
  if (opts.debut) { where += ' AND i.date_inventaire >= ?'; params.push(opts.debut); }
  if (opts.fin) { where += ' AND i.date_inventaire <= ?'; params.push(opts.fin + ' 23:59:59'); }
  if (opts.article_id) { where += ' AND i.article_id = ?'; params.push(opts.article_id); }
  const sql = `
    SELECT ${dim.select},
      COUNT(*) AS nb_inventaires,
      COALESCE(SUM(i.stock_theorique),0) AS stock_theorique,
      COALESCE(SUM(i.quantite_comptee),0) AS quantite_comptee,
      COALESCE(SUM(i.ecart),0) AS ecart,
      COALESCE(SUM(i.ecart * COALESCE(a.prix_unitaire,0)),0) AS valeur_ecart
    FROM inventaires i
    LEFT JOIN articles a ON i.article_id = a.id
    LEFT JOIN users u ON i.user_id = u.id
    ${where}
    GROUP BY ${dim.group}
    ORDER BY ${dim.order}`;
  return db.prepare(sql).all(...params);
}

// Alertes & ruptures : détail des articles sous seuil
function alertes(db) {
  const rows = db.prepare(`
    SELECT a.id, a.reference, a.nom, a.stock_actuel, a.stock_min, a.unite,
      COALESCE(a.prix_unitaire,0) AS prix_unitaire,
      COALESCE(a.stock_actuel * COALESCE(a.prix_unitaire,0),0) AS valeur,
      CASE WHEN a.stock_actuel <= 0 THEN 'rupture' ELSE 'alerte' END AS statut,
      COALESCE(c.name,'-') AS categorie,
      COALESCE(f.nom,'-') AS fournisseur
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    LEFT JOIN fournisseurs f ON a.fournisseur_id = f.id
    WHERE a.stock_actuel <= a.stock_min
    ORDER BY (a.stock_min - a.stock_actuel) DESC`).all();
  const totals = { nb_alertes: 0, nb_ruptures: 0, valeur_risque: 0, valeur: 0 };
  for (const r of rows) {
    if (r.statut === 'rupture') { totals.nb_ruptures++; totals.valeur_risque += r.valeur; }
    else { totals.nb_alertes++; totals.valeur_risque += r.valeur; }
    totals.valeur += r.valeur;
  }
  return { rows, totals };
}

// Fiches de réception par agence / statut / mois
function fichesReception(db, opts) {
  const dim = opts.group_by === 'statut'
    ? { label: 'Statut', select: "CASE fr.statut WHEN 'brouillon' THEN 'Brouillon' WHEN 'envoyee' THEN 'Envoyée' WHEN 'retournee' THEN 'Retournée' ELSE 'Archivée' END AS libelle", group: "fr.statut", order: "libelle ASC" }
    : opts.group_by === 'mois'
    ? { label: 'Mois', select: "strftime('%Y-%m', fr.date_creation) AS libelle", group: "strftime('%Y-%m', fr.date_creation)", order: "libelle ASC" }
    : { label: 'Agence', select: "COALESCE(l.nom,'(sans agence)') AS libelle", group: "COALESCE(l.nom,'(sans agence)')", order: "nb_fiches DESC" };
  let where = 'WHERE 1=1';
  const params = [];
  if (opts.debut) { where += ' AND fr.date_creation >= ?'; params.push(opts.debut); }
  if (opts.fin) { where += ' AND fr.date_creation <= ?'; params.push(opts.fin + ' 23:59:59'); }
  if (opts.localite_id) { where += ' AND fr.localite_id = ?'; params.push(opts.localite_id); }
  if (opts.statut) { where += ' AND fr.statut = ?'; params.push(opts.statut); }
  const sql = `
    SELECT ${dim.select},
      COUNT(*) AS nb_fiches,
      COALESCE(SUM((SELECT COALESCE(SUM(fra.quantite),0) FROM fiche_reception_articles fra WHERE fra.fiche_id = fr.id)),0) AS quantite,
      SUM(CASE WHEN fr.statut='envoyee' THEN 1 ELSE 0 END) AS envoyees,
      SUM(CASE WHEN fr.statut='signee' THEN 1 ELSE 0 END) AS signees,
      SUM(CASE WHEN fr.statut='archivee' THEN 1 ELSE 0 END) AS archivees
    FROM fiches_reception fr
    LEFT JOIN localites l ON fr.localite_id = l.id
    ${where}
    GROUP BY ${dim.group}
    ORDER BY ${dim.order}`;
  return db.prepare(sql).all(...params);
}

// Billets en circulation par agence (émis / envoyés / retournés)
// Note : source_id d'une série 'sortie' référence soit fiches_reception.id (flux normal
// d'envoi via fiches_reception.js), soit mouvements.id (corrections admin via
// routes/mouvements.js PATCH /:id/numero, cf. import historique). Les deux jointures sont
// nécessaires — une jointure unique sur mouvements ratait silencieusement le flux normal.
function series(db) {
  const rows = db.prepare(`
    SELECT COALESCE(l.nom,'(sans agence)') AS libelle,
      COALESCE((
        SELECT SUM(s.quantite) FROM series_numeros s
        LEFT JOIN fiches_reception fr ON fr.id = s.source_id AND s.source_type = 'sortie'
        LEFT JOIN mouvements mv ON mv.id = s.source_id AND s.source_type = 'sortie'
        WHERE s.source_type = 'sortie' AND COALESCE(fr.localite_id, mv.localite_id) = l.id
      ),0) AS envoyes,
      COALESCE((SELECT SUM(r.quantite) FROM retours_carnets r WHERE r.localite_id = l.id AND r.type_retour='usage'),0) AS retournes_usage,
      COALESCE((SELECT SUM(r.quantite) FROM retours_carnets r WHERE r.localite_id = l.id AND r.type_retour='non_utilise'),0) AS retournes_stock
    FROM localites l
    WHERE l.id IN (SELECT DISTINCT fr2.localite_id FROM series_numeros s2 JOIN fiches_reception fr2 ON fr2.id = s2.source_id WHERE s2.source_type='sortie' AND fr2.localite_id IS NOT NULL)
       OR l.id IN (SELECT DISTINCT localite_id FROM mouvements WHERE type='sortie' AND localite_id IS NOT NULL)
       OR l.id IN (SELECT DISTINCT localite_id FROM retours_carnets)
    ORDER BY envoyes DESC`).all();
  return rows.map(r => ({ ...r, en_circulation: r.envoyes - r.retournes_usage - r.retournes_stock }));
}

// Articles dormants : stock non nul sans mouvement depuis N jours
function dormants(db, opts) {
  const seuilJ = Math.max(1, opts.stock_min_jours || 30);
  const seuilDate = daysAgoISO(seuilJ);
  const rows = db.prepare(`
    SELECT a.id, a.reference, a.nom, a.stock_actuel, a.unite,
      COALESCE(a.stock_actuel * COALESCE(a.prix_unitaire,0),0) AS valeur,
      COALESCE(c.name,'-') AS categorie,
      COALESCE((SELECT MAX(m.date) FROM mouvements m WHERE m.article_id = a.id),'-') AS dernier_mouvement,
      CASE WHEN a.stock_actuel <= a.stock_min THEN 'bas' ELSE 'ok' END AS statut
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    WHERE a.stock_actuel > 0
      AND NOT EXISTS (SELECT 1 FROM mouvements m WHERE m.article_id = a.id AND m.date >= ?)
    ORDER BY a.stock_actuel DESC`).all(seuilDate);
  const totals = { nb: rows.length, valeur: rows.reduce((s, r) => s + r.valeur, 0), seuil_jours: seuilJ };
  return { rows, totals };
}

// Jours de couverture : stock actuel / conso journalière moyenne sur la fenêtre
function couverture(db, opts) {
  const jours = Math.max(1, opts.jours || 90);
  const fin = opts.fin || todayISO();
  const debut = opts.debut || daysAgoISO(jours);
  // Nombre réel de jours de la fenêtre (borné)
  const d0 = new Date(debut + 'T00:00:00');
  const d1 = new Date(fin + 'T00:00:00');
  const joursFenetre = !isNaN(d0.getTime()) && !isNaN(d1.getTime()) && d1 >= d0
    ? Math.max(1, Math.round((d1 - d0) / 86400000) + 1) : jours;

  const articles = db.prepare(`
    SELECT a.id, a.reference, a.nom, a.stock_actuel, a.unite,
      COALESCE(a.stock_actuel * COALESCE(a.prix_unitaire,0),0) AS valeur,
      COALESCE(c.name,'-') AS categorie,
      (SELECT COALESCE(SUM(m2.quantite),0) FROM mouvements m2
        WHERE m2.article_id = a.id AND m2.type='sortie' AND m2.date >= ? AND m2.date <= ?) AS sorties_fenetre
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    WHERE a.stock_actuel > 0 OR EXISTS (
      SELECT 1 FROM mouvements m3 WHERE m3.article_id = a.id AND m3.type='sortie' AND m3.date >= ? AND m3.date <= ?
    )
    ORDER BY a.nom ASC`).all(debut, fin + ' 23:59:59', debut, fin + ' 23:59:59');

  const rows = articles.map(a => {
    const consoQuotidienne = (a.sorties_fenetre || 0) / joursFenetre;
    const joursCouv = a.stock_actuel > 0 && consoQuotidienne > 0 ? Math.round((a.stock_actuel / consoQuotidienne) * 10) / 10 : null;
    return {
      libelle: a.nom, reference: a.reference, unite: a.unite, categorie: a.categorie,
      stock_actuel: a.stock_actuel, valeur: a.valeur,
      sorties_fenetre: a.sorties_fenetre || 0, jours_couverture: joursCouv
    };
  });
  const totals = { fenetre_jours: joursFenetre, articles_couverts: rows.filter(r => r.jours_couverture !== null).length };
  return { rows, totals };
}

// Top articles par valeur de stock (loi 20/80)
function topValeur(db) {
  const rows = db.prepare(`
    SELECT a.reference, a.nom, a.stock_actuel, a.unite,
      COALESCE(a.prix_unitaire,0) AS prix_unitaire,
      COALESCE(a.stock_actuel * COALESCE(a.prix_unitaire,0),0) AS valeur,
      COALESCE(c.name,'-') AS categorie
    FROM articles a
    LEFT JOIN categories c ON a.categorie_id = c.id
    WHERE a.stock_actuel > 0
    ORDER BY valeur DESC
    LIMIT 10`).all();
  const valeurTotaleStock = db.prepare(
    "SELECT COALESCE(SUM(stock_actuel * prix_unitaire),0) AS v FROM articles").get().v;
  const totals = { valeur_top: rows.reduce((s, r) => s + r.valeur, 0), valeur_totale: valeurTotaleStock };
  return { rows, totals };
}

// Évolution de la valeur (entrées / sorties) par mois
function valeurEvolution(db, opts) {
  const filters = buildMovementFilters(opts);
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', m.date) AS libelle,
      COALESCE(SUM(CASE WHEN m.type='entree' THEN m.quantite*COALESCE(a.prix_unitaire,0) ELSE 0 END),0) AS valeur_entrees,
      COALESCE(SUM(CASE WHEN m.type='sortie' THEN m.quantite*COALESCE(a.prix_unitaire,0) ELSE 0 END),0) AS valeur_sorties
    FROM mouvements m
    LEFT JOIN articles a ON m.article_id = a.id
    ${filters.where}
    GROUP BY strftime('%Y-%m', m.date)
    ORDER BY libelle ASC`).all(...filters.params);
  const rowsWithSolde = rows.map(r => ({ ...r, solde_valeur: r.valeur_entrees - r.valeur_sorties }));
  if (opts.debut && opts.fin) return fillPeriod(rowsWithSolde, 'mois', opts.debut, opts.fin);
  return rowsWithSolde;
}

// === Références pour la barre de filtres ===
function getMeta(db) {
  return {
    articles: db.prepare('SELECT id, reference, nom FROM articles ORDER BY nom ASC').all(),
    categories: db.prepare('SELECT id, name FROM categories ORDER BY name ASC').all(),
    localites: db.prepare("SELECT id, nom FROM localites WHERE est_service = 0 ORDER BY nom ASC").all(),
    fournisseurs: db.prepare('SELECT id, nom FROM fournisseurs ORDER BY nom ASC').all(),
    users: db.prepare("SELECT id, username FROM users ORDER BY username ASC").all()
  };
}

// === Builders d'export ===

function buildCsv(rows, columns) {
  const q = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = columns.map(c => q(c.header)).join(';');
  const body = rows.map(r => columns.map(c => q(r[c.key])).join(';')).join('\r\n');
  return '﻿' + head + '\r\n' + body + '\r\n';
}

function styleHeaderRow(ws, columns, rowNumber) {
  const hr = ws.getRow(rowNumber || 1);
  hr.height = 20;
  columns.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NIZAR.turquoise } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF' + NIZAR.turquoiseFonce } } };
  });
}

function addDataRows(ws, columns, rows, startRow) {
  let idx = 0;
  for (const r of rows) {
    const row = ws.addRow(r);
    row.height = 18;
    const alt = idx % 2 === 1;
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { vertical: 'middle', horizontal: c.align || 'left' };
      if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NIZAR.infoBg } };
    });
    idx++;
  }
}

function buildWorkbook(opts) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName || 'Rapport');
  const nCols = opts.columns.length;
  ws.columns = opts.columns.map(c => ({ key: c.key, width: c.width || 18 }));

  // Ligne de titre (noir marque)
  ws.mergeCells(1, 1, 1, nCols);
  const tr = ws.getRow(1);
  tr.getCell(1).value = opts.titre;
  tr.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  tr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NIZAR.noir } };
  tr.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  tr.height = 26;

  // Ligne d'en-tête (turquoise)
  styleHeaderRow(ws, opts.columns, 2);

  ws.views = [{ state: 'frozen', ySplit: 2 }];

  // Lignes de données avec alternance turquoise clair
  addDataRows(ws, opts.columns, opts.rows);

  // Ligne de total
  if (opts.totals) {
    const trow = ws.addRow(opts.totals);
    trow.font = { bold: true };
    opts.columns.forEach((c, i) => {
      const cell = trow.getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NIZAR.gris } };
      cell.border = { top: { style: 'medium', color: { argb: 'FF' + NIZAR.noir } } };
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { vertical: 'middle', horizontal: c.align || 'left' };
    });
  }

  // Feuilles supplémentaires (résumé ou détail multi-colonnes)
  if (opts.extraSheets) {
    for (const s of opts.extraSheets) {
      const ws2 = wb.addWorksheet(s.name);
      const cols = s.columns || [{ header: 'Indicateur', key: 'label', width: 34 }, { header: 'Valeur', key: 'value', width: 22 }];
      ws2.columns = cols.map(c => ({ key: c.key, width: c.width || 18 }));
      styleHeaderRow(ws2, cols, 1);
      addDataRows(ws2, cols, s.rows || []);
    }
  }

  return wb;
}

function safeFilename(slug) {
  return 'rapport-' + String(slug).replace(/[^a-z0-9-]/gi, '') + '-' + isoDay(new Date());
}

// === Réponse multi-format (json | xlsx | csv) ===
function respond(req, res, opts) {
  const format = String(req.query.format || 'json').toLowerCase();
  if (format === 'xlsx') {
    const wb = buildWorkbook(opts);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeFilename(opts.slug) + '.xlsx"');
    return wb.xlsx.write(res).then(() => res.end());
  }
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + safeFilename(opts.slug) + '.csv"');
    return res.send(buildCsv(opts.rows, opts.columns));
  }
  const periode = opts.debut || opts.fin
    ? ((opts.debut || 'début') + ' → ' + (opts.fin || "aujourd'hui"))
    : 'Toute la période';
  return res.json({
    meta: { slug: opts.slug, titre: opts.titre, groupBy: opts.groupBy || null, periode },
    rows: opts.rows,
    totals: opts.totals || null
  });
}

module.exports = {
  HttpError,
  sanitizeQuery,
  resolveDimension,
  aggregateMouvements,
  movementTotals,
  ventilationStock,
  stockTotals,
  consommation,
  sortiesAgence,
  entreesFournisseurs,
  commandes,
  retours,
  inventaires,
  alertes,
  fichesReception,
  series,
  dormants,
  couverture,
  topValeur,
  valeurEvolution,
  getMeta,
  buildCsv,
  buildWorkbook,
  respond,
  todayISO,
  daysAgoISO
};
