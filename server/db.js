// SQLite via Node's built-in node:sqlite (no native build needed).
//
// Two performance notes that matter under load:
//  1. Every SQL string is prepared once and reused (see `q()`), because
//     re-preparing inside a request handler is pure overhead.
//  2. Destination stats are computed in the SAME query as the rows, so listing
//     destinations is 1 round trip instead of 1 + 3 per row (was an N+1).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const config = require('./config');

const DB_PATH = config.dbFile;
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA cache_size = -20000;
  PRAGMA temp_store = MEMORY;
`);

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

CREATE INDEX IF NOT EXISTS idx_ratings_dest    ON ratings(destination_id);
CREATE INDEX IF NOT EXISTS idx_ratings_user    ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_dest   ON comments(destination_id);
CREATE INDEX IF NOT EXISTS idx_comments_user   ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_dest_category   ON destinations(category);
`);

// --- prepared-statement cache ------------------------------------------------
const stmtCache = new Map();
const STMT_CACHE_MAX = 200;

/** Prepare (once) and return a cached statement for `sql`. */
function q(sql) {
  let stmt = stmtCache.get(sql);
  if (stmt) return stmt;
  if (stmtCache.size >= STMT_CACHE_MAX) stmtCache.clear();
  stmt = db.prepare(sql);
  stmtCache.set(sql, stmt);
  return stmt;
}

// --- queries shared across routes -------------------------------------------
// One query per request, stats included: avg rating, rating count, comment count.
const DEST_SELECT = `
  SELECT d.*,
    COALESCE((SELECT AVG(r.score) FROM ratings r WHERE r.destination_id = d.id), 0) AS avg_rating,
    (SELECT COUNT(*) FROM ratings r WHERE r.destination_id = d.id) AS rating_count,
    (SELECT COUNT(*) FROM comments c WHERE c.destination_id = d.id) AS comment_count
  FROM destinations d`;

/** Shape a destination row exactly as the API has always returned it. */
function mapDestination(row, myRating = null) {
  if (!row) return row;
  return {
    ...row,
    avg_rating: Number(Number(row.avg_rating || 0).toFixed(2)),
    rating_count: Number(row.rating_count || 0),
    comment_count: Number(row.comment_count || 0),
    my_rating: myRating,
  };
}

function myRatingFor(userId, destinationId) {
  if (!userId) return null;
  const r = q('SELECT score FROM ratings WHERE user_id=? AND destination_id=?').get(userId, destinationId);
  return r ? r.score : null;
}

// Seed destinations only if the table is empty
function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c;
  if (count > 0) return 0;
  const dataPath = path.join(__dirname, 'data', 'destinations.json');
  if (!fs.existsSync(dataPath)) {
    console.warn('[seed] destinations.json missing — skipping seed');
    return 0;
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
  return list.length;
}

module.exports = { db, q, DEST_SELECT, mapDestination, myRatingFor, seedIfEmpty, DB_PATH };
