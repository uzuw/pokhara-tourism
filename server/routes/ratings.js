// Ratings (nested under /api/destinations/:slug).
const express = require('express');
const router = express.Router();

const { q } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parseScore, RULES, isStr } = require('../validate');

function destIdFromSlug(slug) {
  if (!isStr(slug) || slug.length > RULES.SLUG_MAX) return null;
  const d = q('SELECT id FROM destinations WHERE slug=?').get(slug);
  return d ? d.id : null;
}

// GET /api/destinations/:slug/ratings  -> summary + recent ratings
router.get('/:slug/ratings', (req, res) => {
  const destId = destIdFromSlug(req.params.slug);
  if (!destId) return res.status(404).json({ error: 'destination not found' });

  const summary = q(`
    SELECT COALESCE(AVG(score),0) AS avg, COUNT(*) AS count,
      SUM(score=1) AS s1, SUM(score=2) AS s2, SUM(score=3) AS s3, SUM(score=4) AS s4, SUM(score=5) AS s5
    FROM ratings WHERE destination_id=?
  `).get(destId);
  const distribution = { 1: summary.s1 || 0, 2: summary.s2 || 0, 3: summary.s3 || 0, 4: summary.s4 || 0, 5: summary.s5 || 0 };
  const ratings = q(`
    SELECT r.id, r.score, r.created_at, u.username
    FROM ratings r JOIN users u ON u.id=r.user_id
    WHERE r.destination_id=? ORDER BY r.created_at DESC LIMIT 50
  `).all(destId);

  res.json({ avg: Number(summary.avg.toFixed(2)), count: summary.count, distribution, ratings });
});

// POST /api/destinations/:slug/ratings  (auth) -> upsert my rating
router.post('/:slug/ratings', requireAuth, (req, res) => {
  const destId = destIdFromSlug(req.params.slug);
  if (!destId) return res.status(404).json({ error: 'destination not found' });

  const score = parseScore(req.body && req.body.score);
  if (score === null) return res.status(400).json({ error: 'score must be an integer between 1 and 5' });

  const existing = q('SELECT id FROM ratings WHERE user_id=? AND destination_id=?').get(req.user.sub, destId);
  if (existing) {
    q("UPDATE ratings SET score=?, created_at=datetime('now') WHERE id=?").run(score, existing.id);
  } else {
    q('INSERT INTO ratings (user_id,destination_id,score) VALUES (?,?,?)').run(req.user.sub, destId, score);
  }
  const summary = q('SELECT COALESCE(AVG(score),0) AS avg, COUNT(*) AS count FROM ratings WHERE destination_id=?').get(destId);
  res.json({ ok: true, my_rating: score, avg: Number(summary.avg.toFixed(2)), rating_count: summary.count });
});

// GET /api/destinations/:slug/my-rating (auth)
router.get('/:slug/my-rating', requireAuth, (req, res) => {
  const destId = destIdFromSlug(req.params.slug);
  if (!destId) return res.status(404).json({ error: 'destination not found' });
  const r = q('SELECT score FROM ratings WHERE user_id=? AND destination_id=?').get(req.user.sub, destId);
  res.json({ my_rating: r ? r.score : null });
});

module.exports = router;
