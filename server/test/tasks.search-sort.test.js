const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { parseListQuery } = require('../src/modules/tasks/validation');
const { makeDb, withServer } = require('./_taskTestHelpers');

const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));
const emptyDb = () => makeDb(() => ({ rows: [] }));

// Runs GET /tasks?<query> against a mock database and returns the one query it sent.
async function listWith(query, db = emptyDb()) {
  let status;
  await withServer(mountWith(db), async (base) => {
    status = (await fetch(`${base}/api/v1/tasks?${query}`)).status;
  })();
  return { status, call: db.calls[0] };
}

test('TC-Task-06: no query string keeps the default (newest first) and only the user id parameter', async () => {
  const { status, call } = await listWith('');
  assert.equal(status, 200);
  assert.deepEqual(call.params, [42]);
  assert.match(call.sql, /ORDER BY t\.created_at DESC, t\.id DESC/);
});

test('TC-Task-06: q, status and priority become separate SQL parameters (never pasted into the SQL)', async () => {
  const { status, call } = await listWith('q=report&status=completed&priority=high');
  assert.equal(status, 200);
  assert.deepEqual(call.params, [42, '%report%', 'COMPLETED', 'HIGH']);
  assert.match(call.sql, /t\.title ILIKE \$2 ESCAPE/);
  assert.match(call.sql, /t\.status = \$3/);
  assert.match(call.sql, /t\.priority = \$4/);
  assert.doesNotMatch(call.sql, /report/);
});

test('TC-Task-06: LIKE wildcards in the search text are escaped', async () => {
  const { call } = await listWith(`q=${encodeURIComponent('50%_off\\')}`);
  assert.deepEqual(call.params, [42, '%50\\%\\_off\\\\%']);
});

test('TC-Task-06: tag filter is case-insensitive and uses the tag tables', async () => {
  const { call } = await listWith('tag=Work');
  assert.deepEqual(call.params, [42, 'work']);
  assert.match(call.sql, /FROM task_tags tt JOIN tags g ON g\.id = tt\.tag_id/);
  assert.match(call.sql, /g\.name = \$2/);
});

for (const [due, pattern, params] of [
  ['overdue', /t\.due_date < NOW\(\) AND t\.status <> 'COMPLETED'/, [42]],
  ['today', /t\.due_date::date = CURRENT_DATE/, [42]],
  ['week', /BETWEEN CURRENT_DATE AND CURRENT_DATE \+ 7/, [42]],
  ['none', /t\.due_date IS NULL/, [42]],
  ['2026-11-05', /t\.due_date::date = \$2::date/, [42, '2026-11-05']],
]) {
  test(`TC-Task-06: due=${due} filters by due date`, async () => {
    const { status, call } = await listWith(`due=${due}`);
    assert.equal(status, 200);
    assert.match(call.sql, pattern);
    assert.deepEqual(call.params, params);
  });
}

test('TC-Task-06: filters combine with AND and keep the access rules', async () => {
  const { call } = await listWith('status=PENDING&due=overdue&q=x');
  assert.match(call.sql, /t\.deleted_at IS NULL/);
  assert.match(call.sql, /t\.owner_id = \$1/);
  assert.match(call.sql, /list_shares/);
  assert.deepEqual(call.params, [42, '%x%', 'PENDING']);
});

for (const [query, pattern] of [
  ['sort=dueDate', /ORDER BY t\.due_date ASC NULLS LAST, t\.id DESC/],
  ['sort=dueDate&order=desc', /ORDER BY t\.due_date DESC NULLS LAST/],
  ['sort=priority', /CASE t\.priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC/],
  ['sort=priority&order=asc', /CASE t\.priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END ASC/],
  ['sort=createdAt&order=asc', /ORDER BY t\.created_at ASC, t\.id ASC/],
]) {
  test(`TC-Task-07: ${query} sorts as expected`, async () => {
    const { status, call } = await listWith(query);
    assert.equal(status, 200);
    assert.match(call.sql, pattern);
  });
}

for (const [query, message] of [
  ['status=DONE', 'status must be PENDING, IN_PROGRESS or COMPLETED'],
  ['priority=urgent', 'priority must be LOW, MEDIUM or HIGH'],
  ['due=tomorrow', 'due must be overdue, today, week, none or a date (YYYY-MM-DD)'],
  ['due=2026-02-30', 'due must be overdue, today, week, none or a date (YYYY-MM-DD)'],
  ['sort=title', 'sort must be createdAt, dueDate or priority'],
  ['sort=created_at;DROP TABLE tasks', 'sort must be createdAt, dueDate or priority'],
  ['order=up', 'order must be asc or desc'],
  [`q=${'x'.repeat(101)}`, 'q must be 100 characters or fewer'],
  [`tag=${'x'.repeat(51)}`, 'tag must be 50 characters or fewer'],
]) {
  test(`VALIDATION: ?${query.slice(0, 30)} returns 400 and the database is not called`, async () => {
    const db = makeDb(() => { throw new Error('database must not be called'); });
    let res;
    let body;
    await withServer(mountWith(db), async (base) => {
      res = await fetch(`${base}/api/v1/tasks?${query}`);
      body = await res.json();
    })();
    assert.equal(res.status, 400);
    assert.equal(body.error, message);
    assert.equal(db.calls.length, 0);
  });
}

test('parseListQuery: blank values are ignored and repeated values use the first one', () => {
  const { errors, value } = parseListQuery({ q: '   ', status: ['pending', 'completed'], sort: '' });
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { status: 'PENDING', sort: 'createdAt', order: 'desc' });
});
