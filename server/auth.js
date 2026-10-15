// Auth helpers: password hashing + JWT.
//
// Password hashing uses Node's built-in scrypt (N=2^14, r=8, p=1 — ~16MB and
// ~50ms, comparable to bcrypt cost 10-12). Two reasons over bcryptjs:
//   * crypto.scrypt is genuinely asynchronous (libuv threadpool), so hashing
//     concurrent logins does not freeze the event loop — measured: bcryptjs's
//     "async" API runs its KDF synchronously and blocks for the whole time.
//   * zero dependencies / no native build step.
// Existing bcrypt rows still verify, and are upgraded to scrypt on next login.
const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // legacy hash verification only
const jwt = require('jsonwebtoken');

const config = require('./config');

const JWT_SECRET = config.jwtSecret;
const JWT_EXPIRES = config.jwtExpiresIn;
const JWT_ALG = 'HS256';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, saltBytes: 16, maxmem: 64 * 1024 * 1024 };
const SCRYPT_PREFIX = 'scrypt';

function scryptAsync(plain, salt, { N, r, p, keylen }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(plain, salt, keylen, { N, r, p, maxmem: SCRYPT.maxmem }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

function formatScrypt(salt, derived, { N, r, p }) {
  return `${SCRYPT_PREFIX}$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function hashPasswordAsync(plain) {
  const salt = crypto.randomBytes(SCRYPT.saltBytes);
  const derived = await scryptAsync(plain, salt, SCRYPT);
  return formatScrypt(salt, derived, SCRYPT);
}

const isLegacyHash = (stored) => typeof stored === 'string' && /^\$2[aby]\$/.test(stored);

async function verifyPasswordAsync(plain, stored) {
  if (typeof stored !== 'string') return false;

  if (isLegacyHash(stored)) return bcrypt.compare(plain, stored); // pre-migration row

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (!N || !r || !p || !salt.length || !expected.length) return false;

  const derived = await scryptAsync(plain, salt, { N, r, p, keylen: expected.length });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// Precomputed once per process: an unknown account must cost the same as a
// known one, otherwise response timing enumerates registered usernames.
const DUMMY_HASH = (() => {
  const salt = crypto.randomBytes(SCRYPT.saltBytes);
  const derived = crypto.scryptSync('not-a-real-password', salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return formatScrypt(salt, derived, SCRYPT);
})();

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES, algorithm: JWT_ALG }
  );
}

// Pin the algorithm: never let a token's own header choose how it is verified.
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] });
}

module.exports = {
  hashPasswordAsync,
  verifyPasswordAsync,
  isLegacyHash,
  signToken,
  verifyToken,
  JWT_SECRET,
  JWT_ALG,
  DUMMY_HASH,
};
