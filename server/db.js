// SQLite via Node's built-in node:sqlite (no native build needed)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Allow an isolated test database via env var so Jest never touches the
// real tourism.db (and never the running dev server's DB). The file is
// created on demand inside DATA_DIR.
const DB_PATH = process.env.TOURISM_TEST_DB
  ? path.join(DATA_DIR, process.env.TOURISM_TEST_DB)
  : path.join(DATA_DIR, 'tourism.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified INTEGER DEFAULT 0,
  is_admin      INTEGER DEFAULT 0,
  bio           TEXT DEFAULT '',
  avatar        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS destinations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT DEFAULT 'Sight',
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  short_desc   TEXT DEFAULT '',
  description  TEXT DEFAULT '',
  best_time    TEXT DEFAULT '',
  entry_fee    TEXT DEFAULT 'Free',
  tags         TEXT DEFAULT '',
  image        TEXT DEFAULT '',
  featured     INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  destination_id INTEGER NOT NULL,
  score         INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, destination_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  destination_id INTEGER NOT NULL,
  text          TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(destination_id) REFERENCES destinations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ratings_dest ON ratings(destination_id);
CREATE INDEX IF NOT EXISTS idx_comments_dest ON comments(destination_id);
`);

// Seed destinations only if the table is empty
function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c;
  if (count > 0) return;
  const dataPath = path.join(__dirname, 'data', 'destinations.json');
  if (!fs.existsSync(dataPath)) {
    console.warn('[seed] destinations.json missing — skipping seed');
    return;
  }
  const list = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const ins = db.prepare(
    `INSERT INTO destinations (slug,name,category,lat,lng,short_desc,description,best_time,entry_fee,tags,image,featured)
     VALUES (@slug,@name,@category,@lat,@lng,@short_desc,@description,@best_time,@entry_fee,@tags,@image,@featured)`
  );
  db.exec('BEGIN');
  try {
    list.forEach((r) => {
      const { search, ...row } = r; // 'search' is metadata for the image fetcher, not a column
      ins.run(row);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  console.log(`[seed] inserted ${list.length} destinations`);
}

module.exports = { db, seedIfEmpty };
