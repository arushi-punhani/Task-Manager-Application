// TaskModule (owner: Aryan). Base path: /api/v1/tasks
// Every route requires a logged-in user.
const express = require('express');
const pool = require('../../config/db');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');
const { createRequireTaskAccess } = require('../../middleware/taskAccess');
const { validateTaskFields, toTask } = require('./validation');

function createTasksRouter({ db = pool, authMiddleware = authenticate } = {}) {
  const router = express.Router();
  const requireTaskAccess = createRequireTaskAccess({ db });
  router.use(authMiddleware);

  // TM-F-010: create a task owned by the signed-in user.
  router.post('/', async (req, res, next) => {
    const { errors, value } = validateTaskFields(req.body, { requireTitle: true });
    if (errors.length) {
      return res.status(400).json({ error: errors[0], details: errors });
    }
    try {
      const result = await db.query(
        `INSERT INTO tasks (owner_id, title, description, due_date, priority)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.user.id, value.title, value.description ?? null, value.dueDate ?? null, value.priority ?? 'MEDIUM'],
      );
      return res.status(201).json(toTask(result.rows[0]));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/', notImplemented('TM-F-015'));               // search, filter, sort: ?q=&status=&priority=&tag=&due=&sort= (TM-F-016)
  // TM-F-011: edit title, description, due date, priority or status (owner, or a list share with EDIT).
  const EDITABLE_COLUMNS = {
    title: 'title',
    description: 'description',
    dueDate: 'due_date',
    priority: 'priority',
    status: 'status',
  };

  router.patch('/:id', requireTaskAccess('edit'), async (req, res, next) => {
    const { errors, value } = validateTaskFields(req.body, { allowStatus: true });
    if (errors.length) {
      return res.status(400).json({ error: errors[0], details: errors });
    }
    const fields = Object.keys(value);
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }

    // Column names come from the fixed map above, never from the request, so this is safe from injection.
    const params = [];
    let statusParam = null;
    const sets = fields.map((field) => {
      params.push(value[field]);
      if (field === 'status') {
        statusParam = params.length;
        // Cast to text: the same parameter is used again in the CASE below, and PostgreSQL rejects
        // one parameter inferred as both varchar (the column) and text (the comparison).
        return `status = $${params.length}::text`;
      }
      return `${EDITABLE_COLUMNS[field]} = $${params.length}`;
    });
    if (statusParam) {
      // In an UPDATE, SET expressions see the OLD row, so test the NEW status (the parameter), not the column.
      // Keep the original completion time if it stays COMPLETED; clear it when the task is reopened.
      sets.push(`completed_at = CASE WHEN $${statusParam}::text = 'COMPLETED' THEN COALESCE(completed_at, NOW()) ELSE NULL END`);
    }
    params.push(req.task.id);

    try {
      const result = await db.query(
        `UPDATE tasks SET ${sets.join(', ')}
         WHERE id = $${params.length} AND deleted_at IS NULL
         RETURNING *`,
        params,
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
      return res.json(toTask(result.rows[0]));
    } catch (error) {
      return next(error);
    }
  });

  // TM-F-012: soft delete (owner only). The row stays for 30 days (TM-NF-005) and the deletion is logged.
  // One statement, so the delete and its audit entry succeed or fail together.
  router.delete('/:id', requireTaskAccess('delete'), async (req, res, next) => {
    try {
      await db.query(
        `WITH deleted AS (
           UPDATE tasks SET deleted_at = NOW()
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING id
         )
         INSERT INTO audit_log (actor_id, action, target_id)
         SELECT $2, 'TASK_DELETED', id FROM deleted`,
        [req.task.id, req.user.id],
      );
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
  // TM-F-013: mark complete (owner, assignee or EDIT share). Safe to repeat: the first completion time is kept.
  router.post('/:id/complete', requireTaskAccess('complete'), async (req, res, next) => {
    try {
      const result = await db.query(
        `UPDATE tasks
         SET status = 'COMPLETED', completed_at = COALESCE(completed_at, NOW())
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [req.task.id],
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
      return res.json(toTask(result.rows[0]));
    } catch (error) {
      return next(error);
    }
  });

  // TM-F-013: reopen a completed task. Reopening a task that is not completed is a conflict (409).
  router.post('/:id/reopen', requireTaskAccess('complete'), async (req, res, next) => {
    if (req.task.status !== 'COMPLETED') {
      return res.status(409).json({ error: 'Only a completed task can be reopened' });
    }
    try {
      const result = await db.query(
        `UPDATE tasks
         SET status = 'PENDING', completed_at = NULL
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [req.task.id],
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
      return res.json(toTask(result.rows[0]));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

const router = createTasksRouter();
// Export the factory as a property so routes can be tested with a mock database.
router.createTasksRouter = createTasksRouter;

module.exports = router;
