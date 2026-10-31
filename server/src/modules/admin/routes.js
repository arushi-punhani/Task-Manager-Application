// AdminModule. Base path: /api/v1/admin. ADMIN role only.
// TM-F-050: list, disable/enable, and delete user accounts.
// Successful account changes are recorded in audit_log (TM-F-051).
const express = require('express');
const pool = require('../../config/db');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const VALID_STATUSES = new Set(['ACTIVE', 'DISABLED']);

const LIST_USERS_SQL = `
  SELECT
    id,
    email,
    role,
    status,
    email_verified AS "emailVerified",
    created_at AS "createdAt"
  FROM users
  ORDER BY created_at DESC, id DESC
  LIMIT $1 OFFSET $2
`;

const COUNT_USERS_SQL = 'SELECT COUNT(*)::int AS total FROM users';
const LIST_AUDIT_LOGS_SQL = `
  SELECT
    audit.id,
    audit.actor_id AS "actorId",
    actor.email AS "actorEmail",
    audit.action,
    audit.target_id AS "targetId",
    audit.timestamp,
    audit.outcome
  FROM audit_log AS audit
  LEFT JOIN users AS actor ON actor.id = audit.actor_id
  ORDER BY audit.timestamp DESC, audit.id DESC
  LIMIT $1 OFFSET $2
`;
const COUNT_AUDIT_LOGS_SQL = 'SELECT COUNT(*)::int AS total FROM audit_log';

// A single SQL statement keeps the status change, session revocation, and audit
// entry atomic. Revoking sessions makes a disabled account's existing JWTs stop
// working immediately because authenticate checks auth_sessions.revoked_at.
const UPDATE_USER_STATUS_SQL = `
  WITH updated AS (
    UPDATE users
    SET status = $1
    WHERE id = $2
    RETURNING id, email, role, status,
              email_verified AS "emailVerified",
              created_at AS "createdAt"
  ), revoked_sessions AS (
    UPDATE auth_sessions
    SET revoked_at = NOW()
    WHERE user_id = $2
      AND $1 = 'DISABLED'
      AND revoked_at IS NULL
    RETURNING token_id
  ), audit_entry AS (
    INSERT INTO audit_log (actor_id, action, target_id, outcome)
    SELECT
      $3,
      CASE WHEN $1 = 'DISABLED' THEN 'USER_DISABLED' ELSE 'USER_ENABLED' END,
      updated.id,
      'SUCCESS'
    FROM updated
    RETURNING id
  )
  SELECT
    updated.id,
    updated.email,
    updated.role,
    updated.status,
    updated."emailVerified",
    updated."createdAt"
  FROM updated
`;

// Deleting a user and recording who deleted them are one atomic statement.
// target_id intentionally has no FK, so the audit entry survives the deletion.
const DELETE_USER_SQL = `
  WITH deleted AS (
    DELETE FROM users
    WHERE id = $1
    RETURNING id
  ), audit_entry AS (
    INSERT INTO audit_log (actor_id, action, target_id, outcome)
    SELECT $2, 'USER_DELETED', deleted.id, 'SUCCESS'
    FROM deleted
    RETURNING id
  )
  SELECT id FROM deleted
`;

function parsePositiveId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parsePageNumber(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) return null;
  return parsed;
}

function toPublicUser(row) {
  return {
    id: Number(row.id),
    email: row.email,
    role: row.role,
    status: row.status,
    emailVerified: Boolean(row.emailVerified ?? row.email_verified),
    createdAt: row.createdAt ?? row.created_at,
  };
}

function toPublicAuditLog(row) {
  return {
    id: Number(row.id),
    actorId: row.actorId == null ? null : Number(row.actorId),
    actorEmail: row.actorEmail ?? null,
    action: row.action,
    targetId: row.targetId == null ? null : Number(row.targetId),
    timestamp: row.timestamp ?? row.createdAt ?? row.created_at,
    outcome: row.outcome,
  };
}
function createAdminRouter({
  db = pool,
  authMiddleware = authenticate,
  adminMiddleware = requireAdmin,
} = {}) {
  const router = express.Router();
  router.use(authMiddleware, adminMiddleware);

  // GET /api/v1/admin/users?limit=50&offset=0
  // Password hashes and other authentication secrets are never returned.
  router.get('/users', async (req, res, next) => {
    const limit = parsePageNumber(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = parsePageNumber(req.query.offset, 0, 1_000_000_000);
    if (limit === null || limit < 1 || offset === null) {
      return res.status(400).json({
        error: `limit must be between 1 and ${MAX_PAGE_SIZE}; offset must be a non-negative integer`,
      });
    }

    try {
      const [usersResult, countResult] = await Promise.all([
        db.query(LIST_USERS_SQL, [limit, offset]),
        db.query(COUNT_USERS_SQL),
      ]);
      // Viewing the administrator-only account list is also an auditable action.
      await db.query(
        `INSERT INTO audit_log (actor_id, action, target_id, outcome)
         VALUES ($1, 'USERS_LISTED', NULL, 'SUCCESS')`,
        [Number(req.user.id)],
      );
      return res.json({
        users: usersResult.rows.map(toPublicUser),
        pagination: {
          limit,
          offset,
          total: Number(countResult.rows[0]?.total) || 0,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  // PATCH /api/v1/admin/users/:id/status
  // Request body: { "status": "ACTIVE" | "DISABLED" }
  router.patch('/users/:id/status', async (req, res, next) => {
    const userId = parsePositiveId(req.params.id);
    if (userId === null) return res.status(400).json({ error: 'A valid user ID is required' });

    const status = req.body?.status;
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'status must be ACTIVE or DISABLED' });
    }

    const actorId = Number(req.user.id);
    if (status === 'DISABLED' && userId === actorId) {
      return res.status(409).json({ error: 'You cannot disable your own administrator account' });
    }

    try {
      const result = await db.query(UPDATE_USER_STATUS_SQL, [status, userId, actorId]);
      if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: toPublicUser(result.rows[0]) });
    } catch (error) {
      return next(error);
    }
  });

  // DELETE /api/v1/admin/users/:id
  router.delete('/users/:id', async (req, res, next) => {
    const userId = parsePositiveId(req.params.id);
    if (userId === null) return res.status(400).json({ error: 'A valid user ID is required' });

    const actorId = Number(req.user.id);
    if (userId === actorId) {
      return res.status(409).json({ error: 'You cannot delete your own administrator account' });
    }

    try {
      const result = await db.query(DELETE_USER_SQL, [userId, actorId]);
      if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.json({ message: 'User deleted', userId });
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/admin/audit-logs?limit=50&offset=0
  // Returns the administrator identity, action, target, timestamp and outcome.
  router.get('/audit-logs', async (req, res, next) => {
    const limit = parsePageNumber(req.query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = parsePageNumber(req.query.offset, 0, 1_000_000_000);
    if (limit === null || limit < 1 || offset === null) {
      return res.status(400).json({
        error: `limit must be between 1 and ${MAX_PAGE_SIZE}; offset must be a non-negative integer`,
      });
    }

    try {
      const [logsResult, countResult] = await Promise.all([
        db.query(LIST_AUDIT_LOGS_SQL, [limit, offset]),
        db.query(COUNT_AUDIT_LOGS_SQL),
      ]);
      return res.json({
        logs: logsResult.rows.map(toPublicAuditLog),
        pagination: {
          limit,
          offset,
          total: Number(countResult.rows[0]?.total) || 0,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

const router = createAdminRouter();
router.createAdminRouter = createAdminRouter;
router.LIST_USERS_SQL = LIST_USERS_SQL;
router.COUNT_USERS_SQL = COUNT_USERS_SQL;
router.UPDATE_USER_STATUS_SQL = UPDATE_USER_STATUS_SQL;
router.DELETE_USER_SQL = DELETE_USER_SQL;
router.LIST_AUDIT_LOGS_SQL = LIST_AUDIT_LOGS_SQL;
router.COUNT_AUDIT_LOGS_SQL = COUNT_AUDIT_LOGS_SQL;

module.exports = router;
