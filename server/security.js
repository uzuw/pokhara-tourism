// Security middleware: response headers (helmet), CORS allow-list, abuse rate
// limits, a JSON-only 404, and a final error handler that never leaks a stack
// trace or an absolute filesystem path to a client.
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { logger } = require('./logger');

// ---- headers ---------------------------------------------------------------
// The Express process is a JSON API + image host (the UI is a separate Next.js
// app), so a very strict CSP is safe and CORP must allow cross-origin embeds
// for the images.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'none'"],
      'base-uri': ["'none'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'none'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'script-src': ["'none'"],
      'object-src': ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // images are embedded by the web app
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  strictTransportSecurity: {
    maxAge: 15552000, // 180d
    includeSubDomains: true,
    preload: false,
  },
  xContentTypeOptions: true, // nosniff
  xDnsPrefetchControl: { allow: false },
  xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
});

// ---- CORS ------------------------------------------------------------------
// Explicit allow-list. An unknown origin gets no Access-Control-Allow-Origin
// header at all (the browser then blocks it) — never a '*'.
function corsMiddleware() {
  const allow = config.corsOrigins;
  return cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);       // curl, same-origin SSR, health probes
      if (allow.includes('*')) return cb(null, true);
      if (allow.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });
}

// ---- rate limits -----------------------------------------------------------
const disabled = () => config.rateLimit.disabled;

const tooMany = (message) => ({
  handler: (req, res) => {
    logger.warn('rate limit hit', { ip: req.ip, path: req.originalUrl.split('?')[0] });
    res.status(429).json({ error: message, retry_after_s: Math.ceil(config.rateLimit.loginWindowMs / 1000) });
  },
});

// Successful logins don't count, so a busy human on a shared IP is not locked out.
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMs,
  max: config.rateLimit.loginMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: disabled,
  ...tooMany('too many login attempts, please try again later'),
});

const registerLimiter = rateLimit({
  windowMs: config.rateLimit.registerWindowMs,
  max: config.rateLimit.registerMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: disabled,
  ...tooMany('too many accounts created from this address, please try again later'),
});

// Everything that mutates state: 60 writes/min/IP by default.
const writeLimiter = rateLimit({
  windowMs: config.rateLimit.writeWindowMs,
  max: config.rateLimit.writeMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => disabled() || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  ...tooMany('too many requests, please slow down'),
});

// ---- cache-control ---------------------------------------------------------
// Tokens and per-user payloads must never be stored by an intermediary.
function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
}

function noStoreMiddleware(req, res, next) {
  noStore(res);
  next();
}

// ---- terminal middleware ---------------------------------------------------
function notFound(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let code = 'internal_error';
  let message = 'Internal server error';

  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    status = 400; code = 'invalid_json'; message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413; code = 'payload_too_large'; message = 'Request body is too large';
  } else if (status < 500) {
    code = status === 400 ? 'bad_request' : 'error';
    message = err.message || 'Request failed';
  }

  if (status >= 500) {
    logger.error('unhandled error', {
      request_id: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      error: err.message,
      stack: config.isProd ? undefined : (err.stack || '').split('\n').slice(0, 6).join('\n'),
    });
  }

  res.status(status).json({ error: code, message, request_id: req.id });
}

module.exports = {
  securityHeaders,
  corsMiddleware,
  loginLimiter,
  registerLimiter,
  writeLimiter,
  noStore,
  noStoreMiddleware,
  notFound,
  errorHandler,
};
