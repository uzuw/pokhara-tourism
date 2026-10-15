// Comments / reviews.
//
// Two routers: `comments` is mounted under /api/destinations (post + list a
// destination's thread) and `commentsById` under /api/comments (delete by id).
// They are separate so DELETE can never be reached through a destination path.
const express = require('express');

const { q } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { cleanText, parseId, RULES, isStr } = require('../validate');

const comments = express.Router();

const SELECT_COMMENT = `
  SELECT c.id, c.text, c.created_at, u.id AS user_id, u.username, u.avatar
  FROM comments c JOIN users u ON u.id=c.user_id`;

function destIdFromSlug(slug) {
  if (!isStr(slug) || slug.length > RULES.SLUG_MAX) return null;
  const d = q('SELECT id FROM destinations WHERE slug=?').get(slug);
  return d ? d.id : null;
}

// GET /api/destinations/:slug/comments
comments.get('/:slug/comments', (req, res) => {
  const destId = destIdFromSlug(req.params.slug);
  if (!destId) return res.status(404).json({ error: 'destination not found' });
  const rows = q(`${SELECT_COMMENT} WHERE c.destination_id=? ORDER BY c.created_at DESC LIMIT 100`).all(destId);
  res.json({ comments: rows, count: rows.length });
});

// POST /api/destinations/:slug/comments (auth)
comments.post('/:slug/comments', requireAuth, (req, res) => {
  const destId = destIdFromSlug(req.params.slug);
  if (!destId) return res.status(404).json({ error: 'destination not found' });

  const text = cleanText(req.body && req.body.text, {
    min: RULES.COMMENT_MIN,
    max: RULES.COMMENT_MAX,
    field: 'comment',
  });
  if (text.error) return res.status(400).json({ error: text.error });

  const info = q('INSERT INTO comments (user_id,destination_id,text) VALUES (?,?,?)')
    .run(req.user.sub, destId, text.value);
  const comment = q(`${SELECT_COMMENT} WHERE c.id=?`).get(info.lastInsertRowid);
  res.status(201).json({ comment });
});

const commentsById = express.Router();

// DELETE /api/comments/:id (auth, owner or admin)
commentsById.delete('/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'comment not found' });

  const comment = q('SELECT id, user_id FROM comments WHERE id=?').get(id);
  if (!comment) return res.status(404).json({ error: 'comment not found' });

  const user = q('SELECT is_admin FROM users WHERE id=?').get(req.user.sub);
  const isOwner = Number(comment.user_id) === Number(req.user.sub);
  const isAdmin = Boolean(user && user.is_admin);
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'not allowed to delete this comment' });

  q('DELETE FROM comments WHERE id=?').run(id);
  res.json({ ok: true });
});

module.exports = { comments, commentsById };
