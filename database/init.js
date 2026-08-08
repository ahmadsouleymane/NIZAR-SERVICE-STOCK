// database/init.js — Nizar Stock v2
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

function initDB(dbPath) {
  const dbPathResolved = dbPath || path.join(__dirname, 'nizar.db');
  const db = new Database(dbPathResolved);

  // Mode fichier unique (DELETE) : une seule base nizar.db, sans fichiers -wal/-shm
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'assistant')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Destinations / gares / agences
    CREATE TABLE IF NOT EXISTS localites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'national' CHECK(type IN ('national', 'international')),
      pays TEXT DEFAULT 'Niger',
      est_service INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS fournisseurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      contact TEXT,
      telephone TEXT,
      email TEXT,
      adresse TEXT,
      type TEXT NOT NULL DEFAULT 'externe' CHECK(type IN ('externe', 'interne')),
      delai_moyen_j INTEGER DEFAULT 7,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT,
      type_article TEXT NOT NULL DEFAULT 'standard' CHECK(type_article IN ('standard', 'numerote')),
      unite TEXT DEFAULT 'piece',
      stock_min INTEGER DEFAULT 10,
      stock_actuel INTEGER DEFAULT 0,
      prix_unitaire REAL DEFAULT 0,
      fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Fiches de reception
    CREATE TABLE IF NOT EXISTS fiches_reception (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      date_creation TEXT DEFAULT (datetime('now','localtime')),
      date_envoi TEXT,
      localite_id INTEGER NOT NULL REFERENCES localites(id),
      user_id INTEGER REFERENCES users(id),
      statut TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon', 'envoyee', 'signee', 'archivee')),
      notes TEXT,
      destinataire TEXT,
      fichier_path TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Lignes d'une fiche de reception
    CREATE TABLE IF NOT EXISTS fiche_reception_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiche_id INTEGER NOT NULL REFERENCES fiches_reception(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      quantite INTEGER NOT NULL DEFAULT 1,
      numero_debut TEXT,
      numero_fin TEXT,
      observation TEXT
    );

    CREATE TABLE IF NOT EXISTS mouvements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('entree', 'sortie')),
      quantite INTEGER NOT NULL DEFAULT 1,
      motif TEXT,
      demandeur TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
      localite_id INTEGER REFERENCES localites(id) ON DELETE SET NULL,
      fiche_id INTEGER REFERENCES fiches_reception(id) ON DELETE SET NULL,
      commande_id INTEGER REFERENCES commandes(id) ON DELETE SET NULL,
      entree_id INTEGER REFERENCES fiches_entree(id) ON DELETE SET NULL,
      numero_debut TEXT,
      numero_fin TEXT,
      date TEXT DEFAULT (datetime('now','localtime')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Retours de carnets (usages ou non utilises)
    CREATE TABLE IF NOT EXISTS retours_carnets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      localite_id INTEGER REFERENCES localites(id),
      type_retour TEXT NOT NULL CHECK(type_retour IN ('usage', 'non_utilise')),
      quantite INTEGER NOT NULL DEFAULT 1,
      numero_debut TEXT,
      numero_fin TEXT,
      motif TEXT,
      user_id INTEGER REFERENCES users(id),
      date_retour TEXT DEFAULT (datetime('now','localtime')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS commandes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
      statut TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon', 'envoyee', 'recue', 'annulee')),
      date_commande TEXT DEFAULT (datetime('now','localtime')),
      date_reception TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS commande_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commande_id INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      quantite INTEGER NOT NULL DEFAULT 1,
      prix_unitaire REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fiches_entree (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
      date_entree TEXT DEFAULT (datetime('now','localtime')),
      numero_bl TEXT,
      numero_facture TEXT,
      notes TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      statut TEXT NOT NULL DEFAULT 'validee' CHECK(statut IN ('validee','archivee')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS fiche_entree_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiche_id INTEGER NOT NULL REFERENCES fiches_entree(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      quantite INTEGER NOT NULL DEFAULT 1,
      numero_debut TEXT,
      numero_fin TEXT,
      observation TEXT
    );

    CREATE TABLE IF NOT EXISTS fiche_entree_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiche_id INTEGER NOT NULL REFERENCES fiches_entree(id) ON DELETE CASCADE,
      fichier_path TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'autre' CHECK(type IN ('bl','facture','autre')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS series_numeros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      numero_debut TEXT NOT NULL,
      numero_fin TEXT NOT NULL,
      quantite INTEGER NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL CHECK(source_type IN ('entree','sortie','retour')),
      source_id INTEGER,
      date TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Inventaires physiques : comptage + ajustement du stock theorique
    CREATE TABLE IF NOT EXISTS inventaires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      stock_theorique INTEGER NOT NULL DEFAULT 0,
      quantite_comptee INTEGER NOT NULL DEFAULT 0,
      ecart INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      date_inventaire TEXT DEFAULT (datetime('now','localtime')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- Journal d'audit : tracabilite des operations sensibles
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      action TEXT NOT NULL,
      details TEXT,
      date TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // Migration : ajouter les colonnes manquantes aux tables existantes (bases créées avant V2)
  function ensureColumn(db, table, column, ddl) {
    const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
    if (!cols.some((c) => c.name === column)) {
      db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + ddl);
    }
  }
  ensureColumn(db, 'mouvements', 'entree_id', 'INTEGER REFERENCES fiches_entree(id) ON DELETE SET NULL');
  ensureColumn(db, 'mouvements', 'numero_debut', 'TEXT');
  ensureColumn(db, 'mouvements', 'numero_fin', 'TEXT');
  ensureColumn(db, 'localites', 'est_service', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'fiches_reception', 'destinataire', 'TEXT');
  ensureColumn(db, 'fiches_reception', 'scan_path', 'TEXT');
  ensureColumn(db, 'fiches_reception', 'numero_facture', 'TEXT');
  ensureColumn(db, 'fiches_entree', 'validee', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'fiches_entree', 'articles_json', 'TEXT');

  // Migration : restaurer le schema fournisseur/commande (au cas ou une base aurait
  // ete creee sans ces colonnes). Le fournisseur est conserve ; les tables commandes
  // restent en base pour le centre de rapports (la page « Commandes » a ete retiree
  // de l'interface). Idempotent.
  ensureColumn(db, 'articles', 'fournisseur_id', 'INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL');
  ensureColumn(db, 'mouvements', 'fournisseur_id', 'INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL');
  ensureColumn(db, 'mouvements', 'commande_id', 'INTEGER REFERENCES commandes(id) ON DELETE SET NULL');
  ensureColumn(db, 'fiches_entree', 'fournisseur_id', 'INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL');

  // Migration des unites : « piece » devient « unite », et les unites supprimees
  // (« boite », « flacon », « ramette ») sont remappees sur « unite ».
  db.exec("UPDATE articles SET unite = 'unite', updated_at = datetime('now','localtime') WHERE unite IN ('piece', 'boite', 'flacon', 'ramette')");

  // Migration : les fiches d'entree creees avant le flag validee etaient toutes
  // deja validees (lignes en base). On les marque validee=1 pour ne pas les
  // presenter comme des brouillons en attente de photos. Un vrai brouillon
  // (aucune ligne fiche_entree_articles) reste a 0. Idempotent.
  db.exec(`
    UPDATE fiches_entree SET validee = 1
    WHERE validee = 0 AND (
      EXISTS (SELECT 1 FROM fiche_entree_articles fea WHERE fea.fiche_id = fiches_entree.id)
      OR statut = 'archivee'
    )
  `);

  // Seeds — uniquement sur une base VIERGE (aucun utilisateur). Un compte renomme
  // (ex: admin -> Moustapha) n'est donc jamais recree en doublon.
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
    insertUser.run('admin', bcrypt.hashSync('admin123', 10), 'admin');
    insertUser.run('assistant', bcrypt.hashSync('assistant123', 10), 'assistant');
  }

  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCount.count === 0) {
    const cats = ['Documents de transport', 'Fournitures de bureau', 'Imprimes administratifs', 'Emballage', 'Autre'];
    const insert = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
    for (const c of cats) { insert.run(c, 'Categorie : ' + c); }
  }

  const locCount = db.prepare('SELECT COUNT(*) as count FROM localites').get();
  if (locCount.count === 0) {
    const localites = [
      { nom: 'Niamey', type: 'national', pays: 'Niger' },
      { nom: 'Agadez', type: 'national', pays: 'Niger' },
      { nom: 'Dosso', type: 'national', pays: 'Niger' },
      { nom: 'Maradi', type: 'national', pays: 'Niger' },
      { nom: 'Tahoua', type: 'national', pays: 'Niger' },
      { nom: 'Zinder', type: 'national', pays: 'Niger' },
      { nom: 'Abalak', type: 'national', pays: 'Niger' },
      { nom: 'Arlit', type: 'national', pays: 'Niger' },
      { nom: 'Konni', type: 'national', pays: 'Niger' },
      { nom: 'Madaoua', type: 'national', pays: 'Niger' },
      { nom: 'Gaya', type: 'national', pays: 'Niger' },
      { nom: 'Tessaoua', type: 'national', pays: 'Niger' },
      { nom: 'Doutchi', type: 'national', pays: 'Niger' },
      { nom: 'Accra', type: 'international', pays: 'Ghana' },
      { nom: 'Service Achat', type: 'national', pays: 'Niger' }
    ];
    const insertLoc = db.prepare('INSERT INTO localites (nom, type, pays) VALUES (?, ?, ?)');
    for (const l of localites) { insertLoc.run(l.nom, l.type, l.pays); }
  }

  // Services internes du siege (destinations de sortie internes, idempotent)
  const services = ['Service Achat', 'Comptabilite', 'Service Commercial', 'Exploitation', 'Ressources Humaines', 'Direction', 'Service Technique', 'Archives'];
  const findService = db.prepare('SELECT id FROM localites WHERE nom = ?');
  const markService = db.prepare("UPDATE localites SET est_service = 1, type = 'national', pays = 'Niger' WHERE nom = ?");
  const insertService = db.prepare("INSERT INTO localites (nom, type, pays, est_service) VALUES (?, 'national', 'Niger', 1)");
  for (const s of services) {
    if (findService.get(s)) { markService.run(s); }
    else { insertService.run(s); }
  }

  return db;
}

if (require.main === module) {
  const db = initDB();
  console.log('Base de donnees initialisee avec succes (v2).');
  console.log('Comptes: admin/admin123, assistant/assistant123');
  console.log('Localites: 15 destinations seedees.');
  db.close();
}

module.exports = initDB;
