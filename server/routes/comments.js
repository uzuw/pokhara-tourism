const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

function destIdFromSlug(slug) {
  const d = db.prepare('SELECT id FROM destinations WHERE slug=?').get(slug);
  return d ? d.id : null;
}

// GET /api/destinations/:slug/comments
router.get('/:slug/comments', (req, res) => {
  const destId = destIdFromSlug(req.params.slug);
  if (!destId) return res.status(404).json({ error: 'destination not found' });
  const comments = db.prepare(`
    SELECT c.id, c.text, c.created_at, u.id AS user_id, u.username, u.avatar
    FROM comments c JOIN users u ON u.id=c.user_id
    WHERE c.destination_id=? ORDER BY c.created_at DESC LIMIT 100
  `).all(destId);
  res.json({ comments, count: comments.length });
});

// POST /api/destinations/:slug/comments (auth)
router.post('/:slug/comments', requireAuth, (req, res) => {
  const destId = destIdFromSlug(req.params.slug);
  if (!destId) return res.status(404).json({ error: 'destination not found' });
  const text = (req.body && req.body.text || '').trim();
  if (text.length < 2) return res.status(400).json({ error: 'comment is too short' });
  if (text.length > 2000) return res.status(400).json({ error: 'comment is too long (2000 max)' });

  const info = db.prepare('INSERT INTO comments (user_id,destination_id,text) VALUES (?,?,?)').run(req.user.sub, destId, text);
  const comment = db.prepare(`
    SELECT c.id, c.text, c.created_at, u.id AS user_id, u.username, u.avatar
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?
  `).get(info.lastInsertRowid);
  res.status(201).json({ comment });
});

// DELETE /api/comments/:id (auth, owner or admin)
router.delete('/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id=?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'comment not found' });
  const user = db.prepare('SELECT is_admin FROM users WHERE id=?').get(req.user.sub);
  if (comment.user_id !== req.user.sub && !(user && user.is_admin)) {
    return res.status(403).json({ error: 'not allowed to delete this comment' });
  }
  db.prepare('DELETE FROM comments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
