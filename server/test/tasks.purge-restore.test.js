const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { purgeDeletedTasks, startPurgeSchedule, RETENTION_DAYS } = require('../src/jobs/purgeDeletedTasks');
const { makeDb, withServer } = require('./_taskTestHelpers');

const row = (over = {}) => ({
  id: 7, owner_id: 42, assignee_id: null, title: 'Old task', description: null, due_date: null,
  priority: 'MEDIUM', status: 'PENDING', completed_at: null, created_at: new Date('2026-10-01T10:00:00Z'),
  deleted_at: null, tags: [], ...over,
});
const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));

test('TC-Data-01: retention is 30 days', () => {
  assert.equal(RETENTION_DAYS, 30);
});

test('TC-Data-01: the purge job deletes tasks older than 30 days, logs them and returns the count', async () => {
  const db = makeDb(() => ({ rows: [{ purged: 3 }] }));
  assert.equal(await purgeDeletedTasks(db), 3);
  assert.match(db.calls[0].sql, /DELETE FROM tasks/);
  assert.match(db.calls[0].sql, /deleted_at IS NOT NULL AND deleted_at < NOW\(\) - make_interval\(days => \$1\)/);
  assert.match(db.calls[0].sql, /'TASK_PURGED'/);
  assert.deepEqual(db.calls[0].params, [30]);
});

test('the purge schedule runs once at start-up, logs the result and does not crash on a database error', async () => {
  const logs = [];
  const log = { log: (m) => logs.push(m), error: (m) => logs.push(`ERR ${m}`) };
  const okDb = makeDb(() => ({ rows: [{ purged: 2 }] }));
  clearInterval(startPurgeSchedule({ db: okDb, intervalMs: 1e9, log }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(okDb.calls.length, 1);
  assert.match(logs[0], /removed 2 task/);

  const badDb = makeDb(() => { throw new Error('connection lost'); });
  clearInterval(startPurgeSchedule({ db: badDb, intervalMs: 1e9, log }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(logs[1], /ERR Purge job failed: connection lost/);
});

test('TC-Data-01: the owner can restore a task deleted less than 30 days ago', () => {
  const db = makeDb(() => ({ rows: [row()] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7/restore`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).title, 'Old task');
    assert.match(db.calls[0].sql, /UPDATE tasks SET deleted_at = NULL/);
    assert.match(db.calls[0].sql, /owner_id = \$2 AND deleted_at IS NOT NULL/);
    assert.match(db.calls[0].sql, /make_interval\(days => \$3\)/);
    assert.match(db.calls[0].sql, /'TASK_RESTORED'/);
    assert.deepEqual(db.calls[0].params, [7, 42, 30]);
  })();
});

test('TC-Data-01: restoring a task that is not yours, not deleted or past 30 days returns 404', () => {
  const db = makeDb(() => ({ rows: [] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7/restore`, { method: 'POST' });
    assert.equal(res.status, 404);
  })();
});

test('restoring with a bad task ID returns 400 and the database is not called', () => {
  const db = makeDb(() => { throw new Error('database must not be called'); });
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/abc/restore`, { method: 'POST' });
    assert.equal(res.status, 400);
  })();
});

test('TC-Data-01: the recently-deleted list shows only the user\'s own tasks from the last 30 days', () => {
  const when = new Date('2026-10-28T08:00:00Z');
  const db = makeDb(() => ({ rows: [row({ deleted_at: when })] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/deleted`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.tasks.length, 1);
    assert.equal(body.tasks[0].deletedAt, when.toISOString());
    assert.match(db.calls[0].sql, /t\.owner_id = \$1 AND t\.deleted_at IS NOT NULL/);
    assert.match(db.calls[0].sql, /make_interval\(days => \$2\)/);
    assert.deepEqual(db.calls[0].params, [42, 30]);
  })();
});
