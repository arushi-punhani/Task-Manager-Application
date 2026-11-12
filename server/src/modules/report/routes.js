// ReportModule. Mounted at /api/v1 and before /tasks/:id routes.
'use strict';
const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { toCsv } = require('./csv');

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
        SELECT 1 FROM list_shares ls
        WHERE ls.list_id = t.list_id AND ls.user_id = $1
      )
    )
`;

// A user can export only active tasks they can see: owned, assigned, or in a shared list.
const TASK_EXPORT_SQL = `
  SELECT
    t.id,
    t.title,
    COALESCE(t.description, '') AS description,
    t.status,
    t.priority,
    t.due_date,
    t.created_at,
    t.completed_at,
    owner.email AS owner_email,
    assignee.email AS assignee_email,
    COALESCE(tl.name, '') AS list_name,
    COALESCE(
      string_agg(DISTINCT tags.name, ', ' ORDER BY tags.name)
        FILTER (WHERE tags.name IS NOT NULL),
      ''
    ) AS tags
  FROM tasks t
  JOIN users owner ON owner.id = t.owner_id
  LEFT JOIN users assignee ON assignee.id = t.assignee_id
  LEFT JOIN task_lists tl ON tl.id = t.list_id
  LEFT JOIN task_tags tt ON tt.task_id = t.id
  LEFT JOIN tags ON tags.id = tt.tag_id
  WHERE t.deleted_at IS NULL
    AND (
      t.owner_id = $1
      OR t.assignee_id = $1
      OR EXISTS (
        SELECT 1 FROM list_shares ls
        WHERE ls.list_id = t.list_id AND ls.user_id = $1
      )
    )
  GROUP BY t.id, owner.email, assignee.email, tl.name
  ORDER BY t.created_at DESC, t.id DESC
`;

function createReportRouter({ db = pool, authMiddleware = authenticate } = {}) {
  const router = express.Router();
  router.use(authMiddleware);

  // TM-F-040: dashboard counts by status, plus overdue tasks.
  router.get('/dashboard/summary', async (req, res, next) => {
    try {
      const result = await db.query(DASHBOARD_SUMMARY_SQL, [req.user.id]);
      const row = result.rows[0] || {};
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

  // TM-F-041: authenticated export of owned, assigned and shared-list tasks as CSV.
  router.get('/tasks/export', async (req, res, next) => {
    try {
      const format = String(req.query.format || 'csv').toLowerCase();
      if (format === 'pdf') {
        return res.status(501).json({ error: 'PDF export is not included in this release. CSV export is available.' });
      }
      if (format !== 'csv') {
        return res.status(400).json({ error: 'Unsupported export format. Use format=csv.' });
      }

      const result = await db.query(TASK_EXPORT_SQL, [req.user.id]);
      const csv = toCsv(result.rows);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tasks-export-${date}.csv"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.status(200).send(csv);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

const router = createReportRouter();
router.createReportRouter = createReportRouter;
router.DASHBOARD_SUMMARY_SQL = DASHBOARD_SUMMARY_SQL;
router.TASK_EXPORT_SQL = TASK_EXPORT_SQL;

module.exports = router;
