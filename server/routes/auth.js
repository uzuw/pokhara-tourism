// Auth routes: register / login / me.
const express = require('express');

const router = express.Router();
const { q } = require('../db');
const { hashPasswordAsync, verifyPasswordAsync, isLegacyHash, signToken, DUMMY_HASH } = require('../auth');
const { requireAuth } = require('../middleware/auth');
const { noStore } = require('../security');
const { logger } = require('../logger');
const { passwordError, validateUsername, validateEmail, RULES, isStr } = require('../validate');

const SAFE_USER = 'id,username,email,bio,avatar,created_at';

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const name = validateUsername(body.username);
    if (name.error) return res.status(400).json({ error: name.error });
    const mail = validateEmail(body.email);
    if (mail.error) return res.status(400).json({ error: mail.error });
    const pwErr = passwordError(body.password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    // Case-insensitive uniqueness: "Admin" must not coexist with "admin".
    const exists = q('SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE').get(name.value, mail.value);
    if (exists) return res.status(409).json({ error: 'username or email already registered' });

    // scrypt runs in the libuv threadpool, so hashing does not freeze other
    // in-flight requests (see the note at the top of server/auth.js).
    const hash = await hashPasswordAsync(body.password);
    const info = q('INSERT INTO users (username, email, password_hash) VALUES (?,?,?)').run(name.value, mail.value, hash);
    const user = q(`SELECT ${SAFE_USER} FROM users WHERE id=?`).get(info.lastInsertRowid);

    noStore(res);
    res.status(201).json({ token: signToken(user), user });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'username or email already registered' });
    }
    next(e);
  }
});

// POST /api/auth/login  (accepts email or username as `identifier`)
router.post('/login', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { identifier, password } = body;
    if (!isStr(identifier) || !isStr(password) || !identifier.trim() || !password) {
      return res.status(400).json({ error: 'identifier and password are required' });
    }
    if (identifier.length > RULES.IDENTIFIER_MAX || Buffer.byteLength(password, 'utf8') > RULES.PASSWORD_MAX_BYTES) {
      // Do not hash absurd input — reject before spending CPU on it.
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const user = q('SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE').get(identifier.trim(), identifier.trim());

    let ok;
    if (user) {
      ok = await verifyPasswordAsync(password, user.password_hash);
    } else {
      await verifyPasswordAsync(password, DUMMY_HASH); // equalize timing
      ok = false;
    }
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    // Transparent migration: a row still holding a bcrypt hash is re-hashed with
    // scrypt now that we know the plaintext. One-time cost per legacy account.
    if (isLegacyHash(user.password_hash)) {
      try {
        const upgraded = await hashPasswordAsync(password);
        q('UPDATE users SET password_hash=? WHERE id=?').run(upgraded, user.id);
      } catch (e) {
        logger.warn('password hash upgrade failed', { user_id: user.id, error: e.message });
      }
    }

    const safe = { id: user.id, username: user.username, email: user.email, created_at: user.created_at };
    noStore(res);
    res.json({ token: signToken(safe), user: safe });
  } catch (e) {
    next(e);
  }
});

// GET /api/auth/me  (protected)
router.get('/me', requireAuth, (req, res) => {
  const user = q(`SELECT ${SAFE_USER} FROM users WHERE id=?`).get(req.user.sub);
  if (!user) return res.status(401).json({ error: 'invalid or expired token' });
  noStore(res);
  res.json({ user });
});

// POST /api/auth/logout — client drops the token; endpoint exists so the UI can
// revoke server-side later without a contract change. Always 204.
router.post('/logout', (req, res) => {
  noStore(res);
  res.status(204).end();
});

// Any other /api/auth/* path is not a route (keeps 404s JSON).
router.use((req, res) => res.status(404).json({ error: 'not_found', message: 'No such auth endpoint' }));

module.exports = router;
