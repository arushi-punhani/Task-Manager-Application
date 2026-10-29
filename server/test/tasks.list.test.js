const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { makeDb, withServer } = require('./_taskTestHelpers');

const row = (id, title) => ({
  id, owner_id: 42, assignee_id: null, title, description: null, due_date: null, priority: 'MEDIUM',
  status: 'PENDING', completed_at: null, created_at: new Date('2026-10-29T10:00:00Z'),
});
const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));

test('TC-Task-01: the list returns the signed-in user\'s visible tasks, newest first', () => {
  const db = makeDb(() => ({ rows: [row(2, 'Second'), row(1, 'First')] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.tasks.map((t) => t.title), ['Second', 'First']);
    assert.deepEqual(db.calls[0].params, [42]);
    assert.match(db.calls[0].sql, /t\.deleted_at IS NULL/);
    assert.match(db.calls[0].sql, /t\.owner_id = \$1/);
    assert.match(db.calls[0].sql, /t\.assignee_id = \$1/);
    assert.match(db.calls[0].sql, /list_shares/);
    assert.match(db.calls[0].sql, /ORDER BY t\.created_at DESC/);
    assert.match(db.calls[0].sql, /LIMIT 100/);
  })();
});

test('the list is empty (not an error) when the user has no tasks', () => {
  const db = makeDb(() => ({ rows: [] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { tasks: [] });
  })();
});
