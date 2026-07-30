// database/init.js
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

function initDB(dbPath) {
  const dbPathResolved = dbPath || path.join(__dirname, 'nizar.db');
  const db = new Database(dbPathResolved);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'assistant')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fournisseurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      contact TEXT,
      telephone TEXT,
      email TEXT,
      adresse TEXT,
      delai_moyen_j INTEGER DEFAULT 7,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      categorie_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT,
      unite TEXT DEFAULT 'piece',
      stock_min INTEGER DEFAULT 10,
      stock_actuel INTEGER DEFAULT 0,
      prix_unitaire REAL DEFAULT 0,
      fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS commandes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL,
      statut TEXT NOT NULL DEFAULT 'brouillon' CHECK(statut IN ('brouillon', 'envoyee', 'recue', 'annulee')),
      date_commande TEXT DEFAULT (datetime('now')),
      date_reception TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS commande_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commande_id INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      quantite INTEGER NOT NULL DEFAULT 1,
      prix_unitaire REAL DEFAULT 0
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
      commande_id INTEGER REFERENCES commandes(id) ON DELETE SET NULL,
      date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed: comptes utilisateurs par defaut
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin');
  if (adminCount.count === 0) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const assistantHash = bcrypt.hashSync('assistant123', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', adminHash, 'admin');
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('assistant', assistantHash, 'assistant');
  }

  // Seed: categories par defaut
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCount.count === 0) {
    const cats = ['Papeterie', 'Cartouches et toners', 'Fournitures de bureau', 'Nettoyage', 'Autre'];
    const insert = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
    for (const c of cats) {
      insert.run(c, 'Categorie : ' + c);
    }
  }

  return db;
}

// Execution directe
if (require.main === module) {
  const db = initDB();
  console.log('Base de donnees initialisee avec succes.');
  console.log('Comptes crees: admin/admin123, assistant/assistant123');
  db.close();
}

module.exports = initDB;
