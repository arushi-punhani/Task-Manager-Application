// ReportModule. Mounted at /api/v1.
// Dashboard counts include active tasks owned by, assigned to, or shared with the user.
const express = require('express');
const pool = require('../../config/db');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');

const DASHBOARD_SUMMARY_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE t.status = 'PENDING')::int AS pending,
    COUNT(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS "inProgress",
    COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
    COUNT(*) FILTER (
      WHERE t.status <> 'COMPLETED'
        AND t.due_date IS NOT NULL
        AND t.due_date < CURRENT_TIMESTAMP
    )::int AS overdue
  FROM tasks t
  WHERE t.deleted_at IS NULL
    AND (
      t.owner_id = $1
      OR t.assignee_id = $1
      OR EXISTS (
        SELECT 1
        FROM list_shares ls
        WHERE ls.list_id = t.list_id
          AND ls.user_id = $1
      )
    )
`;

function createReportRouter({ db = pool, authMiddleware = authenticate } = {}) {
  const router = express.Router();
  router.use(authMiddleware);

  // TM-F-040: dashboard counts by status, plus overdue tasks.
  router.get('/dashboard/summary', async (req, res, next) => {
    try {
      const result = await db.query(DASHBOARD_SUMMARY_SQL, [req.user.id]);
      const row = result.rows[0] || {};

      // PostgreSQL COUNT values may be returned as strings by some query forms/drivers.
      res.json({
        pending: Number(row.pending) || 0,
        inProgress: Number(row.inProgress) || 0,
        completed: Number(row.completed) || 0,
        overdue: Number(row.overdue) || 0,
      });
    } catch (error) {
      next(error);
    }
  });

  // TM-F-041 is a separate Sprint 2 story; keep its existing placeholder.
  router.get('/tasks/export', notImplemented('TM-F-041')); // ?format=csv|pdf

  return router;
}

const router = createReportRouter();
// Export the factory as a property so the route can be tested with a mock database.
router.createReportRouter = createReportRouter;
router.DASHBOARD_SUMMARY_SQL = DASHBOARD_SUMMARY_SQL;

module.exports = router;
