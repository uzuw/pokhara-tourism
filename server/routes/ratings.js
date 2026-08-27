const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/destinations/:slug/ratings  -> summary + all ratings
router.get('/:slug/ratings', (req, res) => {
  const dest = db.prepare('SELECT id FROM destinations WHERE slug=?').get(req.params.slug);
  if (!dest) return res.status(404).json({ error: 'destination not found' });
  const summary = db.prepare(`
    SELECT COALESCE(AVG(score),0) AS avg, COUNT(*) AS count,
      SUM(score=1) AS s1, SUM(score=2) AS s2, SUM(score=3) AS s3, SUM(score=4) AS s4, SUM(score=5) AS s5
    FROM ratings WHERE destination_id=?
  `).get(dest.id);
  const dist = { 1: summary.s1 || 0, 2: summary.s2 || 0, 3: summary.s3 || 0, 4: summary.s4 || 0, 5: summary.s5 || 0 };
  const ratings = db.prepare(`
    SELECT r.id, r.score, r.created_at, u.username
    FROM ratings r JOIN users u ON u.id=r.user_id
    WHERE r.destination_id=? ORDER BY r.created_at DESC LIMIT 50
  `).all(dest.id);
  res.json({ avg: Number(summary.avg.toFixed(2)), count: summary.count, distribution: dist, ratings });
});

// POST /api/destinations/:slug/ratings  (auth) -> upsert my rating
router.post('/:slug/ratings', requireAuth, (req, res) => {
  const dest = db.prepare('SELECT id FROM destinations WHERE slug=?').get(req.params.slug);
  if (!dest) return res.status(404).json({ error: 'destination not found' });
  const score = parseInt(req.body && req.body.score, 10);
  if (!(score >= 1 && score <= 5)) return res.status(400).json({ error: 'score must be between 1 and 5' });

  const existing = db.prepare('SELECT id FROM ratings WHERE user_id=? AND destination_id=?').get(req.user.sub, dest.id);
  if (existing) {
    db.prepare('UPDATE ratings SET score=?, created_at=datetime(\'now\') WHERE id=?').run(score, existing.id);
  } else {
    db.prepare('INSERT INTO ratings (user_id,destination_id,score) VALUES (?,?,?)').run(req.user.sub, dest.id, score);
  }
  const summary = db.prepare('SELECT COALESCE(AVG(score),0) AS avg, COUNT(*) AS count FROM ratings WHERE destination_id=?').get(dest.id);
  res.json({ ok: true, my_rating: score, avg: Number(summary.avg.toFixed(2)), rating_count: summary.count });
});

// GET /api/destinations/:slug/my-rating (auth)
router.get('/:slug/my-rating', requireAuth, (req, res) => {
  const dest = db.prepare('SELECT id FROM destinations WHERE slug=?').get(req.params.slug);
  if (!dest) return res.status(404).json({ error: 'destination not found' });
  const r = db.prepare('SELECT score FROM ratings WHERE user_id=? AND destination_id=?').get(req.user.sub, dest.id);
  res.json({ my_rating: r ? r.score : null });
});

module.exports = router;
