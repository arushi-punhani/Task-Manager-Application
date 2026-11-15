
const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { sendTaskAssignmentEmail } = require('../auth/mockEmail');

function createCollabRouter({
  db = pool,
  authMiddleware = authenticate,
  mailer = sendTaskAssignmentEmail
} = {}) {
  const router = express.Router();
  router.use(authMiddleware);

  // Check task access and identify the user's permission.
  async function accessibleTask(taskId, userId) {
    return db.query(
      `SELECT t.id, t.title, t.description, t.status, t.priority,
              t.due_date, t.owner_id, t.assignee_id,
              CASE
                WHEN t.owner_id = $2 THEN 'OWNER'
                WHEN t.assignee_id = $2 THEN 'ASSIGNEE'
                ELSE ls.permission
              END AS access
       FROM tasks t
       LEFT JOIN list_shares ls
         ON ls.list_id = t.list_id AND ls.user_id = $2
       WHERE t.id = $1 AND t.deleted_at IS NULL
       AND (
         t.owner_id = $2 OR t.assignee_id = $2 OR ls.user_id = $2
       )`,
      [taskId, userId]
    );
  }

  // Get active users who can be assigned tasks.
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

  // Get task details.
  router.get('/tasks/:id', async (req, res, next) => {
    const taskId = Number(req.params.id);

    if (!Number.isInteger(taskId) || taskId < 1) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    try {
      const result = await accessibleTask(taskId, req.user.id);

      if (!result.rows[0]) {
        return res.status(404).json({
          error: 'Task not found or inaccessible'
        });
      }

      return res.json({ task: result.rows[0] });
    } catch (error) {
      return next(error);
    }
  });

  // Read comments: VIEW, EDIT, ASSIGNEE and OWNER can access.
  router.get('/tasks/:id/comments', async (req, res, next) => {
    const taskId = Number(req.params.id);

    if (!Number.isInteger(taskId) || taskId < 1) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    try {
      const access = await accessibleTask(taskId, req.user.id);

      if (!access.rows[0]) {
        return res.status(404).json({
          error: 'Task not found or inaccessible'
        });
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

  // Assign a task and notify the teammate.
  router.post('/tasks/:id/assign', async (req, res, next) => {
    const taskId = Number(req.params.id);
    const assigneeId = Number(req.body?.assigneeId);

    if (
      !Number.isInteger(taskId) || taskId < 1 ||
      !Number.isInteger(assigneeId) || assigneeId < 1
    ) {
      return res.status(400).json({
        error: 'Valid task ID and assigneeId are required'
      });
    }

    try {
      // Only the task owner can assign it.
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

      const task = result.rows[0];

      // Get the teammate's email address.
      const userResult = await db.query(
        'SELECT email FROM users WHERE id = $1',
        [assigneeId]
      );

      if (!userResult.rows[0]) {
        throw new Error('Assignee email not found');
      }

      // Save in-app and email notification records.
      await db.query(
        `INSERT INTO notifications
          (user_id, type, task_id, channel, sent_at)
         VALUES
          ($1, 'TASK_ASSIGNED', $2, 'IN_APP', NOW()),
          ($1, 'TASK_ASSIGNED', $2, 'EMAIL', NOW())`,
        [assigneeId, taskId]
      );

      // Send assignment email.
      try {
        await mailer({
          to: userResult.rows[0].email,
          taskTitle: task.title
        });
      } catch (emailError) {
        console.error('Assignment email failed:', emailError.message);
      }

      return res.json({ task });
    } catch (error) {
      if (error.code === '23503') {
        return res.status(400).json({
          error: 'Assignee does not exist'
        });
      }

      return next(error);
    }
  });

  // Add comments: VIEW permission is read-only.
  router.post('/tasks/:id/comments', async (req, res, next) => {
    const taskId = Number(req.params.id);
    const comment = typeof req.body?.text === 'string'
      ? req.body.text.trim() : '';

    if (
      !Number.isInteger(taskId) || taskId < 1 ||
      !comment || comment.length > 2000
    ) {
      return res.status(400).json({
        error: 'A valid task ID and comment text (1-2000 characters) are required'
      });
    }

    try {
      const access = await accessibleTask(taskId, req.user.id);

      if (!access.rows[0]) {
        return res.status(404).json({
          error: 'Task not found or inaccessible'
        });
      }

      if (!['OWNER', 'ASSIGNEE', 'EDIT'].includes(access.rows[0].access)) {
        return res.status(403).json({
          error: 'You do not have permission to comment on this task'
        });
      }

      const result = await db.query(
        `INSERT INTO comments (task_id, author_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, task_id, author_id, text, created_at`,
        [taskId, req.user.id, comment]
      );

      return res.status(201).json({
        comment: result.rows[0]
      });
    } catch (error) {
      return next(error);
    }
  });

  // TM-F-022: Share a task list with VIEW or EDIT permission.
  router.post('/lists/:id/shares', async (req, res, next) => {
    const listId = Number(req.params.id);
    const userId = Number(req.body?.userId);
    const permission = req.body?.permission;

    if (
      !Number.isInteger(listId) || listId < 1 ||
      !Number.isInteger(userId) || userId < 1 ||
      !['VIEW', 'EDIT'].includes(permission)
    ) {
      return res.status(400).json({
        error: 'Valid list ID, userId and permission (VIEW or EDIT) are required'
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        error: 'You cannot share a list with yourself'
      });
    }

    try {
      // Check list ownership.
      const listResult = await db.query(
        `SELECT id, owner_id
         FROM task_lists
         WHERE id = $1`,
        [listId]
      );

      if (!listResult.rows[0]) {
        return res.status(404).json({
          error: 'List not found'
        });
      }

      if (Number(listResult.rows[0].owner_id) !== Number(req.user.id)) {
        return res.status(403).json({
          error: 'Only the list owner can share this list'
        });
      }

      // Check that the teammate exists and is active.
      const userResult = await db.query(
        `SELECT id
         FROM users
         WHERE id = $1 AND status = 'ACTIVE'`,
        [userId]
      );

      if (!userResult.rows[0]) {
        return res.status(404).json({
          error: 'Active teammate not found'
        });
      }

      // Insert a new share or update an existing permission.
      const result = await db.query(
        `INSERT INTO list_shares (list_id, user_id, permission)
         VALUES ($1, $2, $3)
         ON CONFLICT (list_id, user_id)
         DO UPDATE SET permission = EXCLUDED.permission
         RETURNING id, list_id, user_id, permission`,
        [listId, userId, permission]
      );

      return res.status(200).json({
        share: result.rows[0]
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

const router = createCollabRouter();
router.createCollabRouter = createCollabRouter;

module.exports = router;
