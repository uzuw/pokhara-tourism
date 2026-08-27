// Shared test setup: builds an isolated app on a temp DB and seeds a few
// destinations so rating/comment tests have something to attach to.
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
// Unique test DB file per run (lives in server/data/, gitignored pattern).
process.env.TOURISM_TEST_DB = `test-${process.pid}.db`;

// Load the app AFTER the env vars are set so db.js picks the test DB.
const app = require('../index');
const { db } = require('../db');

function seedDestinations() {
  db.exec('DELETE FROM ratings; DELETE FROM comments; DELETE FROM destinations; DELETE FROM users;');
  const ins = db.prepare(
    `INSERT INTO destinations (slug,name,category,lat,lng,short_desc,description,best_time,entry_fee,tags,image,featured)
     VALUES (@slug,@name,@category,@lat,@lng,@short_desc,@description,@best_time,@entry_fee,@tags,@image,@featured)`
  );
  const rows = [
    { slug: 'phewa-lake', name: 'Phewa Lake', category: 'Lake', lat: 28.2055, lng: 83.9555, short_desc: 'Second-largest lake in Nepal', description: 'A serene lake with the Annapurna range reflected.', best_time: 'Sunrise', entry_fee: 'Free', tags: 'lake,boating,view', image: '/assets/images/phewa-lake.jpg', featured: 1 },
    { slug: 'sarangkot', name: 'Sarangkot', category: 'Viewpoint', lat: 28.2272, lng: 83.9447, short_desc: 'Himalayan sunrise viewpoint', description: 'Famous for sunrise over the Annapurnas and paragliding.', best_time: 'Dawn', entry_fee: 'Free', tags: 'sunrise,paragliding', image: '/assets/images/sarangkot.jpg', featured: 1 },
    { slug: 'devis-fall', name: "Devi's Fall", category: 'Waterfall', lat: 28.1915, lng: 83.9822, short_desc: 'Underground waterfall', description: 'A waterfall that vanishes into an underground tunnel.', best_time: 'Monsoon', entry_fee: 'NPR 50', tags: 'waterfall', image: '/assets/images/devis-fall.jpg', featured: 0 },
  ];
  db.exec('BEGIN');
  rows.forEach((r) => ins.run(r));
  db.exec('COMMIT');
}

function cleanup() {
  try { db.exec('DELETE FROM ratings; DELETE FROM comments; DELETE FROM destinations; DELETE FROM users;'); } catch (e) {}
  const dbFile = path.join(__dirname, '..', 'data', process.env.TOURISM_TEST_DB);
  [dbFile, dbFile + '-wal', dbFile + '-shm'].forEach((f) => { try { fs.unlinkSync(f); } catch (e) {} });
}

module.exports = { app, db, seedDestinations, cleanup };
