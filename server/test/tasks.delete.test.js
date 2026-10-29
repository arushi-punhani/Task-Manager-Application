const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { makeDb, withServer } = require('./_taskTestHelpers');

function dbFor(access) {
  return makeDb((sql) => {
    if (/LEFT JOIN list_shares/.test(sql)) {
      return { rows: access === 'MISSING' ? [] : [{ id: 7, owner_id: 42, status: 'PENDING', access }] };
    }
    return { rows: [] };
  });
}
const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));
const del = (base, id = 7) => fetch(`${base}/api/v1/tasks/${id}`, { method: 'DELETE' });

test('TC-Task-03: the owner can delete a task (204); it is a soft delete and is logged', () => {
  const db = dbFor('OWNER');
  return withServer(mountWith(db), async (base) => {
    const res = await del(base);
    assert.equal(res.status, 204);
    const write = db.calls[1];
    assert.match(write.sql, /UPDATE tasks SET deleted_at = NOW\(\)/);
    assert.doesNotMatch(write.sql, /DELETE FROM/, 'the row must stay for 30-day recovery');
    assert.match(write.sql, /INSERT INTO audit_log \(actor_id, action, target_id\)/);
    assert.match(write.sql, /'TASK_DELETED'/);
    assert.deepEqual(write.params, [7, 42]);
  })();
});

test("TC-Sec-03: only the owner can delete; assignee, EDIT share, VIEW share and strangers get 403", () => {
  return (async () => {
    for (const access of ['ASSIGNEE', 'EDIT', 'VIEW', null]) {
      const db = dbFor(access);
      await withServer(mountWith(db), async (base) => {
        assert.equal((await del(base)).status, 403, String(access));
        assert.equal(db.calls.length, 1, 'nothing was deleted');
      })();
    }
  })();
});

test('deleting a task that does not exist (or is already deleted) returns 404', () => {
  const db = dbFor('MISSING');
  return withServer(mountWith(db), async (base) => {
    assert.equal((await del(base, 999)).status, 404);
  })();
});

test('a bad id returns 400', () => {
  const db = dbFor('OWNER');
  return withServer(mountWith(db), async (base) => {
    assert.equal((await del(base, 'abc')).status, 400);
    assert.equal(db.calls.length, 0);
  })();
});

test('a database failure on delete returns 500 without details', () => {
  const db = makeDb((sql) => {
    if (/LEFT JOIN list_shares/.test(sql)) return { rows: [{ id: 7, access: 'OWNER', status: 'PENDING' }] };
    throw new Error('disk full');
  });
  return withServer(mountWith(db), async (base) => {
    const res = await del(base);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'Internal server error' });
  })();
});
