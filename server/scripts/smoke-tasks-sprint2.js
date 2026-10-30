// Repeatable end-to-end check of the Sprint 2 task features against a REAL PostgreSQL database:
// search and filter (TM-F-015), sort (TM-F-016), tags (TM-F-014), restore and the 30-day purge (TM-NF-005).
//
//   createdb taskmanager_test
//   psql -d taskmanager_test -f db/schema.sql
//   DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/taskmanager_test node server/scripts/smoke-tasks-sprint2.js
//
// It EMPTIES the users, tasks, tags and audit_log tables, so it refuses to run unless the database name ends in "_test".
const assert = require('node:assert/strict');
const express = require('express');
const { Pool } = require('pg');
const tasksRouter = require('../src/modules/tasks/routes');
const { purgeDeletedTasks } = require('../src/jobs/purgeDeletedTasks');
const errorHandler = require('../src/middleware/errorHandler');

const url = process.env.DATABASE_URL || '';
const dbName = url.split('/').pop().split('?')[0];
if (!dbName.endsWith('_test')) {
  console.error(`Refusing to run: database "${dbName}" does not end in _test. This script deletes data.`);
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString: url });
  await pool.query('TRUNCATE users, tasks, tags, audit_log RESTART IDENTITY CASCADE');
  await pool.query("INSERT INTO users (email, password_hash) VALUES ('a@x.com', 'x'), ('b@x.com', 'x')");

  const app = express();
  app.use(express.json());
  const asUser = (req, res, next) => { req.user = { id: Number(req.headers['x-user'] || 1), role: 'USER' }; next(); };
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db: pool, authMiddleware: asUser }));
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1/tasks`;
  const call = async (method, path, body, user = 1) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-user': String(user) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const titles = (r) => r.body.tasks.map((t) => t.title);
  let n = 0;
  const ok = (label) => console.log(`  ok ${++n}. ${label}`);
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString();

  // --- data: four tasks with different priority, status, due date and tags
  const make = async (title, priority, dueDate, tags) => {
    const r = await call('POST', '', { title, priority, dueDate, tags });
    assert.equal(r.status, 201);
    return r.body.id;
  };
  const alpha = await make('Alpha 50% done', 'LOW', day(-20), ['old']);
  const beta = await make('Beta report', 'HIGH', day(5), ['work', 'urgent']);
  const gamma = await make('Gamma report', 'MEDIUM', null, ['work']);
  const delta = await make('Delta', 'HIGH', day(2), []);
  await call('POST', `/${gamma}/complete`);
  await call('PATCH', `/${delta}`, { status: 'in_progress' });
  ok('four tasks created with priorities, due dates and tags');

  // --- TM-F-015 search and filter (TC-Task-06)
  let r = await call('GET', '?q=report');
  assert.deepEqual(titles(r).sort(), ['Beta report', 'Gamma report']);
  ok('TC-Task-06 search by title text');
  r = await call('GET', `?q=${encodeURIComponent('%')}`);
  assert.deepEqual(titles(r), ['Alpha 50% done']);
  ok('a % in the search text is matched literally, not as a wildcard');
  r = await call('GET', '?status=completed');
  assert.deepEqual(titles(r), ['Gamma report']);
  ok('TC-Task-06 filter by status');
  r = await call('GET', '?priority=high');
  assert.deepEqual(titles(r).sort(), ['Beta report', 'Delta']);
  ok('TC-Task-06 filter by priority');
  r = await call('GET', '?due=overdue');
  assert.deepEqual(titles(r), ['Alpha 50% done']);
  ok('TC-Task-06 filter: overdue');
  r = await call('GET', '?due=week');
  assert.deepEqual(titles(r).sort(), ['Beta report', 'Delta']);
  ok('TC-Task-06 filter: due in the next 7 days');
  r = await call('GET', '?due=none');
  assert.deepEqual(titles(r), ['Gamma report']);
  ok('TC-Task-06 filter: no due date');
  r = await call('GET', `?due=${day(5).slice(0, 10)}`);
  assert.deepEqual(titles(r), ['Beta report']);
  ok('TC-Task-06 filter: one exact date');
  r = await call('GET', '?tag=WORK');
  assert.deepEqual(titles(r).sort(), ['Beta report', 'Gamma report']);
  ok('TC-Task-05 filter by tag (case-insensitive)');
  r = await call('GET', '?q=report&priority=high');
  assert.deepEqual(titles(r), ['Beta report']);
  ok('filters combine with AND');
  r = await call('GET', '', null, 2);
  assert.equal(r.body.tasks.length, 0);
  ok('TC-Sec-03 another user sees none of these tasks');
  r = await call('GET', '?sort=title');
  assert.equal(r.status, 400);
  ok('an invalid sort value returns 400');

  // --- TM-F-016 sort (TC-Task-07)
  r = await call('GET', '?sort=dueDate');
  assert.deepEqual(titles(r), ['Alpha 50% done', 'Delta', 'Beta report', 'Gamma report']);
  ok('TC-Task-07 sort by due date, soonest first, tasks without a date last');
  r = await call('GET', '?sort=dueDate&order=desc');
  assert.deepEqual(titles(r), ['Beta report', 'Delta', 'Alpha 50% done', 'Gamma report']);
  ok('TC-Task-07 sort by due date, latest first');
  r = await call('GET', '?sort=priority');
  assert.deepEqual(titles(r), ['Delta', 'Beta report', 'Gamma report', 'Alpha 50% done']);
  ok('TC-Task-07 sort by priority, high first');
  r = await call('GET', '?sort=createdAt&order=asc');
  assert.deepEqual(titles(r), ['Alpha 50% done', 'Beta report', 'Gamma report', 'Delta']);
  ok('TC-Task-07 sort by creation date, oldest first');

  // --- TM-F-014 tags (TC-Task-05)
  r = await call('GET', '?tag=urgent');
  assert.deepEqual(r.body.tasks[0].tags, ['urgent', 'work']);
  ok('TC-Task-05 tags come back on every task in the list');
  r = await call('PATCH', `/${beta}`, { tags: ['Home', 'work'] });
  assert.deepEqual(r.body.tags, ['home', 'work']);
  r = await call('GET', '?tag=urgent');
  assert.equal(r.body.tasks.length, 0);
  ok('TC-Task-05 editing tags replaces the whole set (urgent removed, home added)');
  r = await call('PATCH', `/${beta}`, { title: 'Beta report v2' });
  assert.deepEqual(r.body.tags, ['home', 'work']);
  ok('editing other fields keeps the tags');
  r = await call('PATCH', `/${beta}`, { tags: [] });
  assert.deepEqual(r.body.tags, []);
  ok('an empty tags list clears the tags');
  r = await call('PATCH', `/${delta}`, { tags: ['x'] }, 2);
  assert.equal(r.status, 403);
  ok('TC-Sec-03 another user cannot change tags (403)');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS c FROM tags WHERE name = $1', ['work'])).rows[0].c, 1);
  ok('the same tag name is stored once per owner');

  // --- TM-NF-005 restore and purge (TC-Data-01)
  for (const id of [alpha, delta, gamma]) assert.equal((await call('DELETE', `/${id}`)).status, 204);
  await pool.query("UPDATE tasks SET deleted_at = NOW() - INTERVAL '1 day' WHERE id = $1", [alpha]);
  await pool.query("UPDATE tasks SET deleted_at = NOW() - INTERVAL '29 days' WHERE id = $1", [delta]);
  await pool.query("UPDATE tasks SET deleted_at = NOW() - INTERVAL '31 days' WHERE id = $1", [gamma]);
  r = await call('GET', '/deleted');
  assert.deepEqual(titles(r), ['Alpha 50% done', 'Delta']);
  ok('TC-Data-01 the recently-deleted list shows tasks deleted in the last 30 days only');
  r = await call('POST', `/${gamma}/restore`);
  assert.equal(r.status, 404);
  ok('TC-Data-01 a task deleted 31 days ago can no longer be restored (404)');
  r = await call('POST', `/${alpha}/restore`, null, 2);
  assert.equal(r.status, 404);
  ok('TC-Sec-03 another user cannot restore it (404)');
  r = await call('POST', `/${alpha}/restore`);
  assert.equal(r.status, 200);
  r = await call('GET', '?q=Alpha');
  assert.equal(r.body.tasks.length, 1);
  ok('TC-Data-01 the owner restores a task within 30 days and it is back in the list');
  assert.equal(await purgeDeletedTasks(pool), 1);
  const left = (await pool.query('SELECT id FROM tasks WHERE id = ANY($1::int[]) ORDER BY id', [[alpha, delta, gamma]])).rows.map((x) => x.id);
  assert.deepEqual(left, [alpha, delta]);
  ok('TC-Data-01 the purge job removes only the task deleted 31 days ago');
  assert.equal(await purgeDeletedTasks(pool), 0);
  ok('running the purge again removes nothing');
  const audit = (await pool.query("SELECT actor_id, action, target_id FROM audit_log WHERE action IN ('TASK_RESTORED', 'TASK_PURGED') ORDER BY id")).rows;
  assert.deepEqual(audit, [
    { actor_id: 1, action: 'TASK_RESTORED', target_id: alpha },
    { actor_id: null, action: 'TASK_PURGED', target_id: gamma },
  ]);
  ok('audit_log records the restore (by the owner) and the purge (by the system)');

  console.log(`\nALL ${n} CHECKS PASSED`);
  server.close();
  await pool.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
