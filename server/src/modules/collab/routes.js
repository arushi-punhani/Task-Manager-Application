const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

function createCollabRouter({ db = pool, authMiddleware = authenticate } = {}) {
  const router = express.Router();
  router.use(authMiddleware);

  async function accessibleTask(taskId, userId) {
    return db.query(
      `SELECT t.id, t.title, t.description, t.status, t.priority,
              t.due_date, t.owner_id, t.assignee_id
       FROM tasks t
       WHERE t.id = $1 AND t.deleted_at IS NULL
       AND (
         t.owner_id = $2 OR t.assignee_id = $2 OR EXISTS (
           SELECT 1 FROM list_shares ls
           WHERE ls.list_id = t.list_id AND ls.user_id = $2
         )
       )`,
      [taskId, userId]
    );
  }

  router.get('/users/assignees', async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, email FROM users
         WHERE status = 'ACTIVE'
         ORDER BY email LIMIT 100`
      );
      return res.json({ assignees: result.rows });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/tasks/:id', async (req, res, next) => {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId < 1) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }
    try {
      const result = await accessibleTask(taskId, req.user.id);
      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Task not found or inaccessible' });
      }
      return res.json({ task: result.rows[0] });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/tasks/:id/comments', async (req, res, next) => {
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId < 1) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }
    try {
      const access = await accessibleTask(taskId, req.user.id);
      if (!access.rows[0]) {
        return res.status(404).json({ error: 'Task not found or inaccessible' });
      }
      const result = await db.query(
        `SELECT c.id, c.task_id, c.author_id, c.text, c.created_at,
                u.email AS author_email
         FROM comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.task_id = $1
         ORDER BY c.created_at ASC`,
        [taskId]
      );
      return res.json({ comments: result.rows });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/tasks/:id/assign', async (req, res, next) => {
    const taskId = Number(req.params.id);
    const assigneeId = Number(req.body?.assigneeId);
    if (!Number.isInteger(taskId) || taskId < 1 ||
        !Number.isInteger(assigneeId) || assigneeId < 1) {
      return res.status(400).json({
        error: 'Valid task ID and assigneeId are required'
      });
    }
    try {
      const result = await db.query(
        `UPDATE tasks SET assignee_id = $1
         WHERE id = $2 AND owner_id = $3 AND deleted_at IS NULL
         RETURNING id, title, assignee_id`,
        [assigneeId, taskId, req.user.id]
      );
      if (!result.rows[0]) {
        return res.status(404).json({
          error: 'Task not found or not owned by you'
        });
      }
      return res.json({ task: result.rows[0] });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(400).json({ error: 'Assignee does not exist' });
      }
      return next(error);
    }
  });

  router.post('/tasks/:id/comments', async (req, res, next) => {
    const taskId = Number(req.params.id);
    const comment = typeof req.body?.text === 'string'
      ? req.body.text.trim() : '';
    if (!Number.isInteger(taskId) || taskId < 1 ||
        !comment || comment.length > 2000) {
      return res.status(400).json({
        error: 'A valid task ID and comment text (1-2000 characters) are required'
      });
    }
    try {
      const access = await accessibleTask(taskId, req.user.id);
      if (!access.rows[0]) {
        return res.status(404).json({ error: 'Task not found or inaccessible' });
      }
      const result = await db.query(
        `INSERT INTO comments (task_id, author_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, task_id, author_id, text, created_at`,
        [taskId, req.user.id, comment]
      );
      return res.status(201).json({ comment: result.rows[0] });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/lists/:id/shares', (req, res) =>
    res.status(501).json({ error: 'List sharing is not implemented yet' })
  );

  return router;
}

const router = createCollabRouter();
router.createCollabRouter = createCollabRouter;
module.exports = router;
