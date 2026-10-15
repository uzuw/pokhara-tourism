// Minimal structured logger — one JSON object per line, so log shippers
// (journald, Loki, CloudWatch) can parse it without regexes.
//
// Lines are batched and flushed on a short timer: writing one stdout chunk per
// request costs real throughput at a few hundred req/s, batching keeps every
// line while cutting syscalls. Set LOG_REQUESTS=0 to drop per-request lines
// entirely (warnings/errors are always kept).
const config = require('./config');

const FLUSH_MS = 250;
const MAX_BUFFER = 200;

const buffers = { out: [], err: [] };
const timers = { out: null, err: null };

function flush(which) {
  if (timers[which]) {
    clearTimeout(timers[which]);
    timers[which] = null;
  }
  const buf = buffers[which];
  if (!buf.length) return;
  const chunk = buf.join('\n') + '\n';
  buf.length = 0;
  const stream = which === 'err' ? process.stderr : process.stdout;
  try {
    stream.write(chunk);
  } catch (e) {
    // Last resort: never let logging take the process down.
  }
}

function flushAll() {
  flush('out');
  flush('err');
}

function emit(level, msg, extra) {
  if (config.isTest) return;
  const which = level === 'error' ? 'err' : 'out';
  buffers[which].push(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
  if (buffers[which].length >= MAX_BUFFER) return flush(which);
  if (!timers[which]) {
    timers[which] = setTimeout(() => flush(which), FLUSH_MS);
    timers[which].unref?.(); // never hold the event loop open for logging
  }
}

process.on('exit', flushAll);

const logger = {
  info: (msg, extra) => emit('info', msg, extra),
  warn: (msg, extra) => emit('warn', msg, extra),
  error: (msg, extra) => emit('error', msg, extra),
  flush: flushAll,
};

// Attaches a request id (honouring an upstream one) and logs one line per
// completed request. Health checks are skipped to keep logs signal-only.
function requestLogger(req, res, next) {
  const crypto = require('crypto');
  req.id = String(req.headers['x-request-id'] || '').slice(0, 64) || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  if (config.isTest || !config.logRequests || req.path === '/api/health') return next();

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger[res.statusCode >= 500 ? 'error' : 'info']('request', {
      request_id: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
      ip: req.ip,
      bytes: Number(res.getHeader('content-length')) || undefined,
    });
  });
  next();
}

module.exports = { logger, requestLogger, flushAll };
