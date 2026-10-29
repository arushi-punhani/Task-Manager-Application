// TaskModule (owner: Aryan). Base path: /api/v1/tasks
// Every route requires a logged-in user.
const express = require('express');
const pool = require('../../config/db');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');
const { validateTaskFields, toTask } = require('./validation');

function createTasksRouter({ db = pool, authMiddleware = authenticate } = {}) {
  const router = express.Router();
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
  router.patch('/:id', notImplemented('TM-F-011'));          // edit task (owner only)
  router.delete('/:id', notImplemented('TM-F-012'));         // soft delete (set deleted_at)
  router.post('/:id/complete', notImplemented('TM-F-013'));
  router.post('/:id/reopen', notImplemented('TM-F-013'));

  return router;
}

const router = createTasksRouter();
// Export the factory as a property so routes can be tested with a mock database.
router.createTasksRouter = createTasksRouter;

module.exports = router;
