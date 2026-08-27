const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/users/me  -> profile + my ratings + my comments
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id,username,email,bio,avatar,created_at FROM users WHERE id=?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const myRatings = db.prepare(`
    SELECT d.slug, d.name, d.image, r.score, r.created_at
    FROM ratings r JOIN destinations d ON d.id=r.destination_id
    WHERE r.user_id=? ORDER BY r.created_at DESC
  `).all(user.id);

  const myComments = db.prepare(`
    SELECT c.id, c.text, c.created_at, d.slug, d.name
    FROM comments c JOIN destinations d ON d.id=c.destination_id
    WHERE c.user_id=? ORDER BY c.created_at DESC
  `).all(user.id);

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM ratings WHERE user_id=?) AS ratings_given,
      (SELECT COUNT(*) FROM comments WHERE user_id=?) AS comments_made
  `).get(user.id, user.id);

  res.json({ user, myRatings, myComments, stats });
});

// PATCH /api/users/me  -> update bio / avatar / username
router.patch('/me', requireAuth, (req, res) => {
  const body = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'user not found' });

  let username = user.username;
  if (typeof body.username === 'string' && body.username.trim() && body.username !== user.username) {
    if (body.username.trim().length < 3) return res.status(400).json({ error: 'username must be at least 3 characters' });
    const clash = db.prepare('SELECT id FROM users WHERE username=? AND id!=?').get(body.username.trim(), user.id);
    if (clash) return res.status(409).json({ error: 'username already taken' });
    username = body.username.trim();
  }
  const bio = typeof body.bio === 'string' ? body.bio.slice(0, 500) : user.bio;
  const avatar = typeof body.avatar === 'string' ? body.avatar.slice(0, 400) : user.avatar;

  db.prepare('UPDATE users SET username=?, bio=?, avatar=? WHERE id=?').run(username, bio, avatar, user.id);
  const updated = db.prepare('SELECT id,username,email,bio,avatar,created_at FROM users WHERE id=?').get(user.id);
  res.json({ user: updated });
});

module.exports = router;
