const test = require('node:test');
const assert = require('node:assert/strict');
const tasksRouter = require('../src/modules/tasks/routes');
const { normalizeTags } = require('../src/modules/tasks/validation');
const { makeDb, withServer, json } = require('./_taskTestHelpers');

const row = (over = {}) => ({
  id: 7, owner_id: 42, assignee_id: null, title: 'Task', description: null, due_date: null,
  priority: 'MEDIUM', status: 'PENDING', completed_at: null, created_at: new Date('2026-10-29T10:00:00Z'),
  tags: [], ...over,
});
const mountWith = (db) => (app) =>
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db, authMiddleware: (req, res, next) => next() }));

test('TC-Task-05: normalizeTags trims, lower-cases and removes duplicates', () => {
  assert.deepEqual(normalizeTags([' Work ', 'work', 'Home']), { tags: ['work', 'home'] });
  assert.deepEqual(normalizeTags([]), { tags: [] });
  assert.deepEqual(normalizeTags(null), { tags: [] });
});

for (const [input, message] of [
  ['work', 'tags must be a list of text values'],
  [[1], 'tags must be a list of text values'],
  [['  '], 'a tag cannot be empty'],
  [['x'.repeat(51)], 'a tag must be 50 characters or fewer'],
  [Array.from({ length: 11 }, (_, i) => `t${i}`), 'a task can have at most 10 tags'],
]) {
  test(`VALIDATION: tags ${JSON.stringify(input).slice(0, 25)} is rejected`, () => {
    assert.equal(normalizeTags(input).error, message);
  });
}

test('TC-Task-05: creating a task with tags saves them in the same statement and returns them', () => {
  const db = makeDb(() => ({ rows: [row({ tags: ['work', 'urgent'] })] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks`, json('POST', { title: 'Task', tags: ['Work', 'URGENT', 'work'] }));
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()).tags, ['work', 'urgent']);
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /INSERT INTO tags/);
    assert.match(db.calls[0].sql, /INSERT INTO task_tags/);
    assert.deepEqual(db.calls[0].params[5], ['work', 'urgent']);
  })();
});

test('creating a task with bad tags returns 400 and nothing is saved', () => {
  const db = makeDb(() => { throw new Error('database must not be called'); });
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks`, json('POST', { title: 'Task', tags: 'work' }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'tags must be a list of text values');
  })();
});

function editDb(updated) {
  return makeDb((sql) => {
    if (/LEFT JOIN list_shares/.test(sql)) return { rows: [row({ access: 'OWNER' })] };
    return { rows: updated ? [updated] : [] };
  });
}

test('TC-Task-05: editing only the tags replaces the tag set in one statement', () => {
  const db = editDb(row({ tags: ['home'] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { tags: ['Home'] }));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).tags, ['home']);
    const update = db.calls[1];
    assert.match(update.sql, /UPDATE tasks SET title = title/);
    assert.match(update.sql, /DELETE FROM task_tags/);
    assert.match(update.sql, /INSERT INTO task_tags/);
    assert.deepEqual(update.params, [7, ['home']]);
  })();
});

test('editing a title and tags together uses one statement with parameters in order', () => {
  const db = editDb(row({ title: 'New', tags: ['a'] }));
  return withServer(mountWith(db), async (base) => {
    await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { title: 'New', tags: ['a'] }));
    const update = db.calls[1];
    assert.match(update.sql, /UPDATE tasks SET title = \$1/);
    assert.deepEqual(update.params, ['New', 7, ['a']]);
  })();
});

test('an empty tags list removes every tag from the task', () => {
  const db = editDb(row({ tags: [] }));
  return withServer(mountWith(db), async (base) => {
    const res = await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { tags: [] }));
    assert.equal(res.status, 200);
    assert.deepEqual(db.calls[1].params, [7, []]);
  })();
});

test('editing without tags leaves the tag tables alone', () => {
  const db = editDb(row({ title: 'New' }));
  return withServer(mountWith(db), async (base) => {
    await fetch(`${base}/api/v1/tasks/7`, json('PATCH', { title: 'New' }));
    assert.doesNotMatch(db.calls[1].sql, /INSERT INTO tags|DELETE FROM task_tags/);
  })();
});

test('the list returns each task\'s tags', () => {
  const db = makeDb(() => ({ rows: [row({ tags: ['a', 'b'] }), row({ id: 8 })] }));
  return withServer(mountWith(db), async (base) => {
    const body = await (await fetch(`${base}/api/v1/tasks`)).json();
    assert.deepEqual(body.tasks.map((t) => t.tags), [['a', 'b'], []]);
  })();
});
