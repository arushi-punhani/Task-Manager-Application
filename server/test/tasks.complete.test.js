const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { makeDb, withServer, json } = require('./_taskTestHelpers');

const row = (over = {}) => ({
  id: 7, owner_id: 42, assignee_id: null, title: 'T', description: null, due_date: null, priority: 'MEDIUM',
  status: 'PENDING', completed_at: null, created_at: new Date('2026-10-29T10:00:00Z'), ...over,
});

function dbFor({ access, current, updated }) {
  return makeDb((sql) => {
    if (/LEFT JOIN list_shares/.test(sql)) return { rows: access === 'MISSING' ? [] : [row({ ...current, access })] };
    if (/^\s*UPDATE tasks/.test(sql)) return { rows: [updated] };
    throw new Error(`unexpected query: ${sql}`);
  });
}
const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));
const post = (base, path) => fetch(`${base}/api/v1/tasks/${path}`, json('POST'));

test('TC-Task-04: complete sets status COMPLETED and a completion timestamp', () => {
  const done = row({ status: 'COMPLETED', completed_at: new Date('2026-10-29T12:00:00Z') });
  const db = dbFor({ access: 'OWNER', current: {}, updated: done });
  return withServer(mountWith(db), async (base) => {
    const res = await post(base, '7/complete');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'COMPLETED');
    assert.equal(body.completedAt, '2026-10-29T12:00:00.000Z');
    assert.match(db.calls[1].sql, /status = 'COMPLETED', completed_at = COALESCE\(completed_at, NOW\(\)\)/);
    assert.deepEqual(db.calls[1].params, [7]);
  })();
});

test('TC-Task-04: reopen puts a completed task back to PENDING and clears the timestamp', () => {
  const db = dbFor({ access: 'OWNER', current: { status: 'COMPLETED', completed_at: new Date() }, updated: row() });
  return withServer(mountWith(db), async (base) => {
    const res = await post(base, '7/reopen');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'PENDING');
    assert.equal(body.completedAt, null);
    assert.match(db.calls[1].sql, /status = 'PENDING', completed_at = NULL/);
  })();
});

test('reopening a task that is not completed returns 409 and changes nothing', () => {
  const db = dbFor({ access: 'OWNER', current: { status: 'PENDING' }, updated: row() });
  return withServer(mountWith(db), async (base) => {
    assert.equal((await post(base, '7/reopen')).status, 409);
    assert.equal(db.calls.length, 1);
  })();
});

test('the assignee and an EDIT share can complete a task', () => {
  return (async () => {
    for (const access of ['ASSIGNEE', 'EDIT']) {
      const db = dbFor({ access, current: {}, updated: row({ status: 'COMPLETED' }) });
      await withServer(mountWith(db), async (base) => {
        assert.equal((await post(base, '7/complete')).status, 200, access);
      })();
    }
  })();
});

test("TC-Sec-03: a view-only share or a stranger cannot complete or reopen (403)", () => {
  return (async () => {
    for (const access of ['VIEW', null]) {
      for (const path of ['7/complete', '7/reopen']) {
        const db = dbFor({ access, current: { status: 'COMPLETED' }, updated: row() });
        await withServer(mountWith(db), async (base) => {
          assert.equal((await post(base, path)).status, 403, `${access} ${path}`);
          assert.equal(db.calls.length, 1);
        })();
      }
    }
  })();
});

test('completing a task that does not exist returns 404', () => {
  const db = dbFor({ access: 'MISSING', current: {}, updated: row() });
  return withServer(mountWith(db), async (base) => {
    assert.equal((await post(base, '999/complete')).status, 404);
  })();
});
