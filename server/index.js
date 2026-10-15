// Entry point. Configuration is loaded (and validated) before anything else:
// in production a missing/placeholder JWT_SECRET aborts the boot here.
const config = require('./config');

const path = require('path');
const express = require('express');
const compression = require('compression');

const { logger, requestLogger, flushAll } = require('./logger');
const {
  securityHeaders,
  corsMiddleware,
  loginLimiter,
  registerLimiter,
  writeLimiter,
  noStoreMiddleware,
  notFound,
  errorHandler,
} = require('./security');
const { db, seedIfEmpty } = require('./db');

const authRoutes = require('./routes/auth');
const destinationRoutes = require('./routes/destinations');
const ratingRoutes = require('./routes/ratings');
const { comments, commentsById } = require('./routes/comments');
const userRoutes = require('./routes/users');

const app = express();

// Correct client IPs behind a reverse proxy (rate limiting keys on req.ip).
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// --- platform middleware ----------------------------------------------------
app.use(securityHeaders);                       // helmet: CSP, HSTS, nosniff, frameguard, …
app.use(requestLogger);                         // one JSON log line per request + X-Request-Id
if (config.compression.enabled) {
  app.use(compression({ threshold: config.compression.threshold, level: config.compression.level }));
}
app.use(corsMiddleware());                      // explicit origin allow-list
app.use(express.json({ limit: config.bodyLimit }));

// --- API --------------------------------------------------------------------
// Everything is private by default; the public catalogue opts into caching.
app.use('/api', noStoreMiddleware);

// Abuse guards: strict on credentials, generous on writes.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api', writeLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/destinations', destinationRoutes); // list + single
app.use('/api/destinations', ratingRoutes);      // nested ratings
app.use('/api/destinations', comments);          // nested comments
app.use('/api/comments', commentsById);          // DELETE /api/comments/:id
app.use('/api/users', userRoutes);

// Liveness + readiness in one: pings the database so a broken volume is visible.
app.get('/api/health', (req, res) => {
  let dbOk = true;
  try {
    db.prepare('SELECT 1 AS ok').get();
  } catch (e) {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    time: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    env: config.env,
  });
});

// Never let an unknown /api path fall through to the static handler.
app.use('/api', notFound);

// --- static image host -------------------------------------------------------
// Only the image directory is public: the UI is the separate Next.js app, and
// nothing outside public/assets should ever be reachable.
app.use(
  '/assets',
  express.static(path.join(__dirname, '..', 'public', 'assets'), {
    index: false,
    dotfiles: 'deny',
    etag: true,
    maxAge: config.staticMaxAge,
    immutable: true,
    fallthrough: false,
  })
);

// --- terminal handlers -------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// --- start (never under test: Jest imports the app directly) -----------------
if (!config.isTest) {
  seedIfEmpty();

  const server = app.listen(config.port, config.host, () => {
    logger.info('api listening', {
      url: `http://${config.host}:${config.port}`,
      env: config.env,
      db: config.dbFile,
      cors: config.corsOrigins.length ? config.corsOrigins : 'same-origin only',
      rate_limits: config.rateLimit.disabled ? 'disabled' : 'on',
    });
  });

  // Graceful shutdown: stop accepting, drain, close the DB. systemd/Docker send
  // SIGTERM on restart and we want in-flight requests to finish first.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    const failSafe = setTimeout(() => {
      logger.warn('shutdown timed out — exiting hard');
      process.exit(1);
    }, 10000);
    failSafe.unref();
    server.close(() => {
      try { db.close(); } catch (e) { /* already closed */ }
      logger.info('shutdown complete');
      flushAll();
      clearTimeout(failSafe);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (e) => logger.error('unhandledRejection', { error: String((e && e.message) || e) }));
  process.on('uncaughtException', (e) => {
    logger.error('uncaughtException', { error: e.message, stack: e.stack });
    shutdown('uncaughtException');
  });
}

module.exports = app;
