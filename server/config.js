// Central runtime configuration. Required FIRST by index.js: it loads .env and
// validates the environment so an unsafe production config fails loudly at
// boot instead of silently shipping guessable tokens.
require('dotenv').config();

const crypto = require('crypto');
const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

// Secrets that must never reach production.
const PLACEHOLDER_SECRETS = new Set([
  'pokhara-tourism-dev-secret-change-me',
  'change-me', 'changeme', 'secret', 'your-secret-here', 'dev-secret',
]);

function resolveJwtSecret() {
  const raw = String(process.env.JWT_SECRET || '').trim();
  if (raw.length >= 32 && !PLACEHOLDER_SECRETS.has(raw.toLowerCase())) return raw;

  if (isProd) {
    throw new Error(
      '[config] JWT_SECRET is missing, a placeholder, or shorter than 32 characters.\n' +
      '         Fix: node scripts/setup_env.js   (or)  openssl rand -hex 48\n' +
      '         Refusing to start in production with a guessable token secret.'
    );
  }
  // Dev/test: derive a random per-process secret so zero-config still works and
  // a forged token signed with the shipped placeholder is always rejected.
  if (!isTest) {
    console.warn(
      '[config] JWT_SECRET is unset or still the placeholder — using a random per-process\n' +
      '         secret. Sessions will not survive a restart. Run `npm run setup:env` once.'
    );
  }
  return crypto.randomBytes(48).toString('hex');
}

const isDisabled = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
const isEnabled = (v, dflt = true) => (v === undefined || v === null || String(v).trim() === '' ? dflt : !isDisabled(v));

// Express accepts: false, a hop count, an IP/subnet list, 'loopback'.
// 'true' is deliberately mapped to a single trusted hop: trusting every hop
// (true) lets a client spoof X-Forwarded-For and defeat rate limiting.
function parseTrustProxy(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return isProd ? 'loopback' : false;
  const s = String(raw).trim();
  const lower = s.toLowerCase();
  if (['false', '0', 'off', 'no'].includes(lower)) return false;
  if (['true', '1', 'on', 'yes'].includes(lower)) return 1;
  if (/^\d+$/.test(s)) return Number(s);
  return s; // 'loopback' or an IP/CIDR list
}

const config = {
  env: NODE_ENV,
  isProd,
  isTest,
  isDev: !isProd && !isTest,

  port: num(process.env.PORT, 4000),
  host: process.env.HOST || '0.0.0.0',

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES || '7d',

  // Where the SQLite file lives: TOURISM_DB_FILE (absolute) wins, then the
  // per-suite test file, then the real DB.
  dbFile: process.env.TOURISM_DB_FILE
    ? path.resolve(process.env.TOURISM_DB_FILE)
    : path.join(__dirname, 'data', process.env.TOURISM_TEST_DB || 'tourism.db'),

  // Comma-separated allow-list. Empty = same-origin only (the safe default).
  corsOrigins: list(process.env.CORS_ORIGINS).length
    ? list(process.env.CORS_ORIGINS)
    : (isProd ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3100', 'http://127.0.0.1:3100']),

  // Behind nginx/Caddy set TRUST_PROXY (e.g. "loopback") so req.ip is real and
  // rate limiting keys on the client, not the proxy.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  bodyLimit: process.env.BODY_LIMIT || (isProd ? '64kb' : '1mb'),

  rateLimit: {
    disabled: isDisabled(process.env.RATE_LIMIT_DISABLED),
    loginMax: num(process.env.AUTH_RATE_MAX, 10),
    loginWindowMs: num(process.env.AUTH_RATE_WINDOW_MS, 15 * 60 * 1000),
    registerMax: num(process.env.REGISTER_RATE_MAX, 10),
    registerWindowMs: num(process.env.REGISTER_RATE_WINDOW_MS, 60 * 60 * 1000),
    writeMax: num(process.env.WRITE_RATE_MAX, 60),
    writeWindowMs: num(process.env.WRITE_RATE_WINDOW_MS, 60 * 1000),
  },

  // Per-request access logs (batched). LOG_REQUESTS=0 keeps warnings/errors only.
  logRequests: isEnabled(process.env.LOG_REQUESTS, true),

  // Response compression is configurable because it trades CPU for bandwidth:
  // measured on the catalogue payload it costs ~30% requests/s to save ~2.4x
  // bytes. Tune per deployment (see docs/AUDIT.md).
  compression: {
    enabled: !isDisabled(process.env.COMPRESSION_DISABLED),
    threshold: num(process.env.COMPRESSION_THRESHOLD, 4096),
    level: Math.min(Math.max(Number(process.env.COMPRESSION_LEVEL) || 4, 1), 9),
  },

  // Public caching for the (unauthenticated) destination catalogue.
  catalogueMaxAge: num(process.env.CATALOGUE_MAX_AGE, 60),
  staticMaxAge: process.env.STATIC_MAX_AGE || '7d',
};

module.exports = config;
