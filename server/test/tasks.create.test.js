const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { validateTaskFields } = require('../src/modules/tasks/validation');
const { makeDb, withServer, json } = require('./_taskTestHelpers');

const savedRow = (over = {}) => ({
  id: 1, owner_id: 42, assignee_id: null, title: 'Write report', description: 'First draft',
  due_date: new Date('2026-11-05T00:00:00.000Z'), priority: 'HIGH', status: 'PENDING',
  completed_at: null, created_at: new Date('2026-10-29T10:00:00.000Z'), ...over,
});

const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));

test('TC-Task-01: a signed-in user can create a task and gets it back (201)', () => {
  const db = makeDb(() => ({ rows: [savedRow()] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks`, json('POST', {
      title: '  Write report  ', description: 'First draft', dueDate: '2026-11-05', priority: 'high',
    }));
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.id, 1);
    assert.equal(body.title, 'Write report');
    assert.equal(body.priority, 'HIGH');
    assert.equal(body.status, 'PENDING');
    assert.deepEqual(body.tags, []);
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /INSERT INTO tasks/);
    // owner is the signed-in user (42), title is trimmed, date becomes an ISO timestamp, priority is upper-cased
    assert.deepEqual(db.calls[0].params, [42, 'Write report', 'First draft', '2026-11-05T00:00:00.000Z', 'HIGH', []]);
  })();
});

test('TC-Task-01: only a title is required; priority defaults to MEDIUM', () => {
  const db = makeDb(() => ({ rows: [savedRow({ priority: 'MEDIUM', description: null, due_date: null })] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks`, json('POST', { title: 'Buy milk' }));
    assert.equal(res.status, 201);
    assert.deepEqual(db.calls[0].params, [42, 'Buy milk', null, null, 'MEDIUM', []]);
  })();
});

for (const [name, body, message] of [
  ['missing title', { description: 'no title' }, 'title is required'],
  ['blank title', { title: '   ' }, 'title is required'],
  ['title that is not text', { title: 123 }, 'title is required'],
  ['title over 255 characters', { title: 'x'.repeat(256) }, 'title must be 255 characters or fewer'],
  ['invalid due date', { title: 'A', dueDate: 'not-a-date' }, 'dueDate must be a valid date'],
  ['invalid priority', { title: 'A', priority: 'URGENT' }, 'priority must be LOW, MEDIUM or HIGH'],
  ['description that is not text', { title: 'A', description: 5 }, 'description must be text'],
]) {
  test(`VALIDATION: ${name} returns 400 and nothing is saved`, () => {
    const db = makeDb(() => { throw new Error('database must not be called'); });
    return withServer(mountWith(db), async (base) => {
      const res = await fetch(`${base}/api/v1/tasks`, json('POST', body));
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, message);
      assert.equal(db.calls.length, 0);
    })();
  });
}

test('VALIDATION: a database failure goes to the standard error handler (500, no details)', () => {
  const db = makeDb(() => { throw new Error('connection refused'); });
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks`, json('POST', { title: 'A' }));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'Internal server error' });
  })();
});

test('validateTaskFields: status is ignored unless allowed, and an empty dueDate clears the date', () => {
  assert.deepEqual(validateTaskFields({ title: 'A', status: 'COMPLETED' }, { requireTitle: true }).value, { title: 'A' });
  assert.deepEqual(validateTaskFields({ dueDate: '' }).value, { dueDate: null });
  assert.deepEqual(validateTaskFields({ status: 'in_progress' }, { allowStatus: true }).value, { status: 'IN_PROGRESS' });
  assert.deepEqual(validateTaskFields({ status: 'DONE' }, { allowStatus: true }).errors, ['status must be PENDING, IN_PROGRESS or COMPLETED']);
});
