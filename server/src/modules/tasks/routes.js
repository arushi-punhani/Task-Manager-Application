// TaskModule (owner: Aryan). Base path: /api/v1/tasks
// Every route requires a logged-in user.
const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { createRequireTaskAccess } = require('../../middleware/taskAccess');
const { validateTaskFields, parseListQuery, toTask } = require('./validation');

// Tag names of a task as one text[] column. `alias` is the task table (or CTE) name in the surrounding query.
const tagsOf = (alias) => `COALESCE(
    (SELECT array_agg(g.name ORDER BY g.name) FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.task_id = ${alias}.id),
    '{}'
  )::text[]`;

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
      // One statement, so the task and its tags are saved together or not at all. Tags belong to the task owner.
      const result = await db.query(
        `WITH new_task AS (
           INSERT INTO tasks (owner_id, title, description, due_date, priority)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *
         ), new_tags AS (
           INSERT INTO tags (owner_id, name)
           SELECT $1, n FROM unnest($6::text[]) AS n
           ON CONFLICT (owner_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id
         ), linked AS (
           INSERT INTO task_tags (task_id, tag_id)
           SELECT new_task.id, new_tags.id FROM new_task, new_tags
         )
         SELECT new_task.*, $6::text[] AS tags FROM new_task`,
        [req.user.id, value.title, value.description ?? null, value.dueDate ?? null, value.priority ?? 'MEDIUM', value.tags ?? []],
      );
      return res.status(201).json(toTask(result.rows[0]));
    } catch (error) {
      return next(error);
    }
  });

  // Task list for the Tasks page: active tasks the user owns, is assigned, or can see via a shared list.
  // TM-F-015 search and filter: ?q= (title contains), status, priority, due (overdue|today|week|none|YYYY-MM-DD).
  // TM-F-016 sort: ?sort=createdAt|dueDate|priority&order=asc|desc. Every value is passed as a SQL parameter.
  router.get('/', async (req, res, next) => {
    const { errors, value } = parseListQuery(req.query);
    if (errors.length) {
      return res.status(400).json({ error: errors[0], details: errors });
    }
    const params = [req.user.id];
    const where = [
      't.deleted_at IS NULL',
      `(t.owner_id = $1
        OR t.assignee_id = $1
        OR EXISTS (
          SELECT 1 FROM list_shares ls
          WHERE ls.list_id = t.list_id AND ls.user_id = $1
        ))`,
    ];
    if (value.q) {
      // Escape LIKE wildcards so "50%" searches for the text 50%, not "50 followed by anything".
      params.push(`%${value.q.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`t.title ILIKE $${params.length} ESCAPE '\\'`);
    }
    if (value.status) {
      params.push(value.status);
      where.push(`t.status = $${params.length}`);
    }
    if (value.priority) {
      params.push(value.priority);
      where.push(`t.priority = $${params.length}`);
    }
    if (value.tag) {
      // Tag names are stored in lower case (TM-F-014), and parseListQuery lower-cases the filter to match.
      params.push(value.tag);
      where.push(`EXISTS (
          SELECT 1 FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
          WHERE tt.task_id = t.id AND g.name = $${params.length}
        )`);
    }
    if (value.due === 'overdue') where.push(`t.due_date < NOW() AND t.status <> 'COMPLETED'`);
    else if (value.due === 'today') where.push('t.due_date::date = CURRENT_DATE');
    else if (value.due === 'week') where.push('t.due_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7');
    else if (value.due === 'none') where.push('t.due_date IS NULL');
    else if (value.due) {
      params.push(value.due);
      where.push(`t.due_date::date = $${params.length}::date`);
    }

    // The direction word comes from a fixed list checked in parseListQuery, never straight from the request.
    const dir = value.order === 'asc' ? 'ASC' : 'DESC';
    const ORDER_BY = {
      createdAt: `t.created_at ${dir}, t.id ${dir}`,
      dueDate: `t.due_date ${dir} NULLS LAST, t.id DESC`,
      priority: `CASE t.priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END ${dir}, t.created_at DESC, t.id DESC`,
    };

    try {
      const result = await db.query(
        `SELECT t.*, ${tagsOf('t')} AS tags
         FROM tasks t
         WHERE ${where.join('\n           AND ')}
         ORDER BY ${ORDER_BY[value.sort]}
         LIMIT 100`,
        params,
      );
      return res.json({ tasks: result.rows.map(toTask) });
    } catch (error) {
      return next(error);
    }
  });
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
    const { tags, ...columns } = value; // tags are stored in their own tables, not in a tasks column
    const fields = Object.keys(columns);
    if (fields.length === 0 && tags === undefined) {
      return res.status(400).json({ error: 'Provide at least one field to update' });
    }

    // Column names come from the fixed map above, never from the request, so this is safe from injection.
    const params = [];
    let statusParam = null;
    const sets = fields.map((field) => {
      params.push(columns[field]);
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
    if (sets.length === 0) sets.push('title = title'); // tags-only edit: UPDATE needs one SET item
    params.push(req.task.id);
    const idParam = params.length;

    // Without tags: one UPDATE. With tags (TM-F-014): one statement that also replaces the task's tag set,
    // so the edit and its tags are saved together or not at all.
    let sql = `UPDATE tasks SET ${sets.join(', ')}
         WHERE id = $${idParam} AND deleted_at IS NULL
         RETURNING *, ${tagsOf('tasks')} AS tags`;
    if (tags !== undefined) {
      params.push(tags);
      const tagsParam = params.length;
      sql = `WITH upd AS (
           UPDATE tasks SET ${sets.join(', ')}
           WHERE id = $${idParam} AND deleted_at IS NULL
           RETURNING *
         ), ensured AS (
           INSERT INTO tags (owner_id, name)
           SELECT upd.owner_id, n FROM upd, unnest($${tagsParam}::text[]) AS n
           ON CONFLICT (owner_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id
         ), removed AS (
           DELETE FROM task_tags
           WHERE task_id IN (SELECT id FROM upd) AND tag_id NOT IN (SELECT id FROM ensured)
         ), added AS (
           INSERT INTO task_tags (task_id, tag_id)
           SELECT upd.id, ensured.id FROM upd, ensured
           ON CONFLICT DO NOTHING
         )
         SELECT upd.*, $${tagsParam}::text[] AS tags FROM upd`;
    }

    try {
      const result = await db.query(sql, params);
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
         RETURNING *, ${tagsOf('tasks')} AS tags`,
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
         RETURNING *, ${tagsOf('tasks')} AS tags`,
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
