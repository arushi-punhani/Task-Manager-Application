require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Validates "Authorization: Bearer <JWT>" and sets req.user = { id, role }.
// Owner: Arushi (TM-F-002, TM-SR-004). Token invalidation on logout is still to do.
function createAuthenticate({ db = pool, jwtSecret = () => process.env.JWT_SECRET } = {}) {
  return async function authenticate(req, res, next) {
  // DEV ONLY shortcut so other modules can be built before login is merged.
  if (process.env.NODE_ENV === 'development' && process.env.DEV_FAKE_USER_ID) {
    req.user = {
      id: Number(process.env.DEV_FAKE_USER_ID),
      role: process.env.DEV_FAKE_USER_ROLE || 'USER',
    };
    return next();
  }

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const payload = jwt.verify(token, jwtSecret());
    const session = await db.query(
      `SELECT token_id FROM auth_sessions
       WHERE token_id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()`,
      [payload.jti, payload.sub],
    );
    if (!session.rows[0]) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = { id: Number(payload.sub), role: payload.role };
    req.authTokenId = payload.jti;
    return next();
  } catch (err) {
    if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError' && err.name !== 'NotBeforeError') {
      return next(err);
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  };
}

const authenticate = createAuthenticate();

// Admin-only endpoints (TM-F-050, TM-F-051).
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = { authenticate, createAuthenticate, requireAdmin };
