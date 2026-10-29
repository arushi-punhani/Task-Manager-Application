// Task access control (TM-SR-003, TC-Sec-03).
// A user may only touch tasks they own, are assigned to, or were shared via a task list.
//   no row            -> 404 (task does not exist or was deleted)
//   row, no access    -> 403 (someone else's private task)
//   row, wrong level  -> 403 (for example a VIEW-only share trying to edit)
const pool = require('../config/db');

const TASK_ACCESS_SQL = `
  SELECT t.*,
         CASE
           WHEN t.owner_id = $2 THEN 'OWNER'
           WHEN t.assignee_id = $2 THEN 'ASSIGNEE'
           ELSE ls.permission
         END AS access
  FROM tasks t
  LEFT JOIN list_shares ls ON ls.list_id = t.list_id AND ls.user_id = $2
  WHERE t.id = $1 AND t.deleted_at IS NULL
`;

// Which access levels may perform which action.
const ALLOWED = {
  read: ['OWNER', 'ASSIGNEE', 'EDIT', 'VIEW'],
  edit: ['OWNER', 'EDIT'],
  complete: ['OWNER', 'ASSIGNEE', 'EDIT'],
  delete: ['OWNER'],
};

function createRequireTaskAccess({ db = pool } = {}) {
  // Usage: router.patch('/:id', requireTaskAccess('edit'), handler). Sets req.task and req.taskAccess.
  return function requireTaskAccess(action) {
    if (!ALLOWED[action]) throw new Error(`Unknown task action: ${action}`);
    return async function taskAccessMiddleware(req, res, next) {
      const taskId = Number(req.params.id);
      if (!Number.isInteger(taskId) || taskId < 1) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }
      try {
        const result = await db.query(TASK_ACCESS_SQL, [taskId, req.user.id]);
        const row = result.rows[0];
        if (!row) return res.status(404).json({ error: 'Task not found' });
        if (!ALLOWED[action].includes(row.access)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        req.task = row;
        req.taskAccess = row.access;
        return next();
      } catch (error) {
        return next(error);
      }
    };
  };
}

module.exports = { createRequireTaskAccess, requireTaskAccess: createRequireTaskAccess(), TASK_ACCESS_SQL, ALLOWED };
