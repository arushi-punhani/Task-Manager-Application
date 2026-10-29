const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequireTaskAccess, TASK_ACCESS_SQL } = require('../src/middleware/taskAccess');
const { makeDb, withServer } = require('./_taskTestHelpers');

// A mock database that returns one task whose access level for the signed-in user is `access`.
const dbWith = (access) =>
  makeDb(() => ({ rows: access === 'MISSING' ? [] : [{ id: 7, owner_id: 1, status: 'PENDING', access }] }));

function check(action, access, expectedStatus) {
  test(`TM-SR-003: '${action}' as ${access} -> ${expectedStatus}`, () => {
    const db = dbWith(access);
    const requireTaskAccess = createRequireTaskAccess({ db });
    return withServer((app) => {
      app.get('/tasks/:id', requireTaskAccess(action), (req, res) => res.json({ access: req.taskAccess, id: req.task.id }));
    }, async (base) => {
      const res = await fetch(`${base}/tasks/7`);
      assert.equal(res.status, expectedStatus);
      if (expectedStatus === 200) assert.deepEqual(await res.json(), { access, id: 7 });
    })();
  });
}

// Edit: only the owner or an EDIT-level share
check('edit', 'OWNER', 200);
check('edit', 'EDIT', 200);
check('edit', 'VIEW', 403);
check('edit', 'ASSIGNEE', 403);
// Complete or reopen: owner, assignee or EDIT-level share
check('complete', 'OWNER', 200);
check('complete', 'ASSIGNEE', 200);
check('complete', 'EDIT', 200);
check('complete', 'VIEW', 403);
// Delete: owner only
check('delete', 'OWNER', 200);
check('delete', 'EDIT', 403);
check('delete', 'ASSIGNEE', 403);
// Read: anyone with access
check('read', 'VIEW', 200);

test("TC-Sec-03: another user's private task is forbidden (403) for every action", async () => {
  // access is NULL when the task exists but the user is not owner, assignee or shared
  for (const action of ['read', 'edit', 'complete', 'delete']) {
    const db = dbWith(null);
    const requireTaskAccess = createRequireTaskAccess({ db });
    await withServer((app) => {
      app.get('/tasks/:id', requireTaskAccess(action), (req, res) => res.json({}));
    }, async (base) => {
      const res = await fetch(`${base}/tasks/7`);
      assert.equal(res.status, 403, action);
    })();
  }
});

test('a task that does not exist or is deleted returns 404', () => {
  const requireTaskAccess = createRequireTaskAccess({ db: dbWith('MISSING') });
  return withServer((app) => {
    app.get('/tasks/:id', requireTaskAccess('edit'), (req, res) => res.json({}));
  }, async (base) => {
    assert.equal((await fetch(`${base}/tasks/999`)).status, 404);
  })();
});

test('a bad task id returns 400 without touching the database', () => {
  const db = dbWith('OWNER');
  const requireTaskAccess = createRequireTaskAccess({ db });
  return withServer((app) => {
    app.get('/tasks/:id', requireTaskAccess('edit'), (req, res) => res.json({}));
  }, async (base) => {
    for (const id of ['abc', '0', '-3', '1.5']) {
      assert.equal((await fetch(`${base}/tasks/${id}`)).status, 400, id);
    }
    assert.equal(db.calls.length, 0);
  })();
});

test('the access query uses the task id and signed-in user id, and ignores deleted tasks', () => {
  const db = dbWith('OWNER');
  const requireTaskAccess = createRequireTaskAccess({ db });
  return withServer((app) => {
    app.get('/tasks/:id', requireTaskAccess('read'), (req, res) => res.json({}));
  }, async (base) => {
    await fetch(`${base}/tasks/7`);
    assert.deepEqual(db.calls[0].params, [7, 42]);
    assert.equal(db.calls[0].sql, TASK_ACCESS_SQL);
    assert.match(TASK_ACCESS_SQL, /deleted_at IS NULL/);
    assert.match(TASK_ACCESS_SQL, /list_shares/);
  })();
});

test('an unknown action name is rejected when the route is set up', () => {
  assert.throws(() => createRequireTaskAccess({ db: dbWith('OWNER') })('fly'), /Unknown task action/);
});
