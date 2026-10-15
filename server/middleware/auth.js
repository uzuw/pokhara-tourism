// JWT auth middleware.
const { verifyToken } = require('../auth');

// RFC 7235: the auth scheme is case-insensitive ("bearer" === "Bearer").
function bearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1].trim() : null;
}

function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'authentication required' });
  try {
    req.user = verifyToken(token);
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

/** Populates req.user when a valid token is present; never rejects. */
function optionalAuth(req, res, next) {
  const token = bearerToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (e) { /* anonymous */ }
  }
  return next();
}

module.exports = { requireAuth, optionalAuth, bearerToken };
