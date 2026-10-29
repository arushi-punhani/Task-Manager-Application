const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { makeDb, withServer, json } = require('./_taskTestHelpers');

const row = (over = {}) => ({
  id: 7, owner_id: 42, assignee_id: null, title: 'Old title', description: null, due_date: null,
  priority: 'MEDIUM', status: 'PENDING', completed_at: null, created_at: new Date('2026-10-29T10:00:00Z'), ...over,
});

// First query is the access check; second is the UPDATE.
function dbFor({ access, updated }) {
  return makeDb((sql) => {
    if (/LEFT JOIN list_shares/.test(sql)) return { rows: access === 'MISSING' ? [] : [row({ access })] };
    if (/^\s*UPDATE tasks/.test(sql)) return { rows: updated ? [updated] : [] };
    throw new Error(`unexpected query: ${sql}`);
  });
}
const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));

test('TC-Task-02: the owner can edit title and priority; the change comes back in the response', () => {
  const db = dbFor({ access: 'OWNER', updated: row({ title: 'New title', priority: 'HIGH' }) });
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { title: ' New title ', priority: 'high' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.title, 'New title');
    assert.equal(body.priority, 'HIGH');
    const update = db.calls[1];
    assert.match(update.sql, /UPDATE tasks SET title = \$1, priority = \$2/);
    assert.match(update.sql, /WHERE id = \$3 AND deleted_at IS NULL/);
    assert.deepEqual(update.params, ['New title', 'HIGH', 7]);
  })();
});

test('TC-Task-02: a user with an EDIT share can edit', () => {
  const db = dbFor({ access: 'EDIT', updated: row({ description: 'x' }) });
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { description: 'x' }));
    assert.equal(res.status, 200);
  })();
});

test('TC-Task-02: the due date can be changed or cleared', () => {
  const db = dbFor({ access: 'OWNER', updated: row() });
  return withServer(mountWith(db), async (base) => {
    await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { dueDate: '2026-12-01' }));
    assert.deepEqual(db.calls[1].params, ['2026-12-01T00:00:00.000Z', 7]);
    await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { dueDate: null }));
    assert.deepEqual(db.calls[3].params, [null, 7]);
  })();
});

test('changing status sets completed_at from the NEW status (not the old row)', () => {
  const db = dbFor({ access: 'OWNER', updated: row({ status: 'COMPLETED' }) });
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { status: 'completed' }));
    assert.equal(res.status, 200);
    const update = db.calls[1];
    assert.match(update.sql, /status = \$1::text, completed_at = CASE WHEN \$1::text = 'COMPLETED'/);
    assert.deepEqual(update.params, ['COMPLETED', 7]);
  })();
});

test('TC-Sec-03: a view-only share or the assignee cannot edit (403) and nothing is updated', () => {
  return (async () => {
    for (const access of ['VIEW', 'ASSIGNEE', null]) {
      const db = dbFor({ access, updated: row() });
      await withServer(mountWith(db), async (base) => {
        const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { title: 'Hacked' }));
        assert.equal(res.status, 403, String(access));
        assert.equal(db.calls.length, 1, 'only the access check ran');
      })();
    }
  })();
});

test('editing a task that does not exist returns 404', () => {
  const db = dbFor({ access: 'MISSING' });
  return withServer(mountWith(db), async (base) => {
    assert.equal((await fetch(`${base}/api/v1/tasks/999`, json('PATCH', { title: 'A' }))).status, 404);
  })();
});

for (const [name, body] of [
  ['an empty body', {}],
  ['a blank title', { title: '  ' }],
  ['an invalid priority', { priority: 'NOW' }],
  ['an invalid status', { status: 'DONE' }],
  ['an invalid due date', { dueDate: 'tomorrow-ish' }],
]) {
  test(`VALIDATION: editing with ${name} returns 400 and nothing is updated`, () => {
    const db = dbFor({ access: 'OWNER', updated: row() });
    return withServer(mountWith(db), async (base) => {
      const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', body));
      assert.equal(res.status, 400);
      assert.ok(!db.calls.some((c) => /^\s*UPDATE/.test(c.sql)));
    })();
  });
}

test('unknown fields in the body (for example ownerId) are ignored, never written', () => {
  const db = dbFor({ access: 'OWNER', updated: row() });
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { title: 'A', ownerId: 1, owner_id: 1, id: 99 }));
    assert.equal(res.status, 200);
    assert.deepEqual(db.calls[1].params, ['A', 7]);
    assert.doesNotMatch(db.calls[1].sql, /owner_id|SET id/);
  })();
});
