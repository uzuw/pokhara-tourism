// User profile.
const express = require('express');
const router = express.Router();

const { q } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateUsername, cappedString, RULES } = require('../validate');

const SAFE_USER = 'id,username,email,bio,avatar,created_at';
const ACTIVITY_LIMIT = 100; // keep the profile payload bounded

// GET /api/users/me  -> profile + my ratings + my comments
router.get('/me', requireAuth, (req, res) => {
  const user = q(`SELECT ${SAFE_USER} FROM users WHERE id=?`).get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const myRatings = q(`
    SELECT d.slug, d.name, d.image, r.score, r.created_at
    FROM ratings r JOIN destinations d ON d.id=r.destination_id
    WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT ?
  `).all(user.id, ACTIVITY_LIMIT);

  const myComments = q(`
    SELECT c.id, c.text, c.created_at, d.slug, d.name
    FROM comments c JOIN destinations d ON d.id=c.destination_id
    WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT ?
  `).all(user.id, ACTIVITY_LIMIT);

  const stats = q(`
    SELECT
      (SELECT COUNT(*) FROM ratings WHERE user_id=?) AS ratings_given,
      (SELECT COUNT(*) FROM comments WHERE user_id=?) AS comments_made
  `).get(user.id, user.id);

  res.json({ user, myRatings, myComments, stats });
});

// PATCH /api/users/me  -> update bio / avatar / username
// Only these three fields are ever read: id, email, is_admin and password_hash
// are not mass-assignable.
router.patch('/me', requireAuth, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const user = q('SELECT * FROM users WHERE id=?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'user not found' });

  let username = user.username;
  if (typeof body.username === 'string' && body.username.trim() && body.username.trim() !== user.username) {
    const check = validateUsername(body.username);
    if (check.error) return res.status(400).json({ error: check.error });
    const clash = q('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(check.value, user.id);
    if (clash) return res.status(409).json({ error: 'username already taken' });
    username = check.value;
  }

  const bio = cappedString(body.bio, RULES.BIO_MAX, user.bio);
  const avatar = cappedString(body.avatar, RULES.AVATAR_MAX, user.avatar);

  q('UPDATE users SET username=?, bio=?, avatar=? WHERE id=?').run(username, bio, avatar, user.id);
  const updated = q(`SELECT ${SAFE_USER} FROM users WHERE id=?`).get(user.id);
  res.json({ user: updated });
});

module.exports = router;
