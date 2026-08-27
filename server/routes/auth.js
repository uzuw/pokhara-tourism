const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (username.length < 3) return res.status(400).json({ error: 'username must be at least 3 characters' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'invalid email address' });
  if (String(password).length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username, email);
  if (exists) return res.status(409).json({ error: 'username or email already registered' });

  const info = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?,?,?)'
  ).run(username, email, hashPassword(password));

  const user = db.prepare('SELECT id,username,email,created_at FROM users WHERE id=?').get(info.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user });
});

// POST /api/auth/login  (accepts email or username as `identifier`)
router.post('/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email=? OR username=?').get(identifier, identifier);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const safe = { id: user.id, username: user.username, email: user.email, created_at: user.created_at };
  res.json({ token: signToken(safe), user: safe });
});

// GET /api/auth/me  (protected)
router.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'not authenticated' });
  try {
    const payload = require('../auth').verifyToken(token);
    const user = db.prepare('SELECT id,username,email,bio,avatar,created_at FROM users WHERE id=?').get(payload.sub);
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json({ user });
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
});

module.exports = router;
