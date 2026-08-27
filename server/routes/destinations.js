const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Attach aggregate rating + comment count + my rating to a destination row
function withStats(row, userId) {
  if (!row) return row;
  const stats = db.prepare(`
    SELECT COALESCE(AVG(score),0) AS avg_rating, COUNT(*) AS rating_count
    FROM ratings WHERE destination_id = ?
  `).get(row.id);
  const commentCount = db.prepare('SELECT COUNT(*) AS c FROM comments WHERE destination_id=?').get(row.id).c;
  let myRating = null;
  if (userId) {
    const r = db.prepare('SELECT score FROM ratings WHERE user_id=? AND destination_id=?').get(userId, row.id);
    myRating = r ? r.score : null;
  }
  return { ...row, avg_rating: Number(stats.avg_rating.toFixed(2)), rating_count: stats.rating_count, comment_count: commentCount, my_rating: myRating };
}

// GET /api/destinations  (list, optional ?category=&q=&featured=)
router.get('/', (req, res) => {
  const { category, q, featured } = req.query;
  let sql = 'SELECT * FROM destinations WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category=?'; params.push(category); }
  if (featured === '1') { sql += ' AND featured=1'; }
  if (q) { sql += ' AND (name LIKE ? OR short_desc LIKE ? OR tags LIKE ?)'; const like = `%${q}%`; params.push(like, like, like); }
  sql += ' ORDER BY featured DESC, name ASC';
  const rows = db.prepare(sql).all(...params).map((r) => withStats(r, null));
  res.json({ destinations: rows, count: rows.length });
});

// GET /api/destinations/:slug
router.get('/:slug', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let userId = null;
  if (token) { try { userId = require('../auth').verifyToken(token).sub; } catch (e) {} }

  const row = db.prepare('SELECT * FROM destinations WHERE slug=?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'destination not found' });
  res.json({ destination: withStats(row, userId) });
});

module.exports = router;
