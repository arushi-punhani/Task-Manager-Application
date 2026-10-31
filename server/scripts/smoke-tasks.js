// Repeatable end-to-end check of the task endpoints against a REAL PostgreSQL database (TEST-S1-TASKS).
//
//   createdb taskmanager_test
//   psql -d taskmanager_test -f db/schema.sql
//   DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/taskmanager_test node server/scripts/smoke-tasks.js
//
// It EMPTIES the users, tasks and audit_log tables, so it refuses to run unless the database name ends in "_test".
const assert = require('node:assert/strict');
const express = require('express');
const { Pool } = require('pg');
const tasksRouter = require('../src/modules/tasks/routes');
const errorHandler = require('../src/middleware/errorHandler');

const url = process.env.DATABASE_URL || '';
const dbName = url.split('/').pop().split('?')[0];
if (!dbName.endsWith('_test')) {
  console.error(`Refusing to run: database "${dbName}" does not end in _test. This script deletes data.`);
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString: url });
  // Users: 1 owner, 2 stranger, 3 VIEW share, 4 EDIT share, 5 assignee
  await pool.query('TRUNCATE users, task_lists, tasks, audit_log RESTART IDENTITY CASCADE');
  for (let i = 1; i <= 5; i++) {
    await pool.query("INSERT INTO users (email, password_hash) VALUES ($1, 'x')", [`u${i}@x.com`]);
  }
  await pool.query("INSERT INTO task_lists (owner_id, name) VALUES (1, 'Shared list')");
  await pool.query("INSERT INTO list_shares (list_id, user_id, permission) VALUES (1, 3, 'VIEW'), (1, 4, 'EDIT')");

  const app = express();
  app.use(express.json());
  const asUser = (req, res, next) => {
    req.user = { id: Number(req.headers['x-user']), role: 'USER' };
    next();
  };
  app.use('/api/v1/tasks', tasksRouter.createTasksRouter({ db: pool, authMiddleware: asUser }));
  app.use(errorHandler);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1/tasks`;
  const call = async (user, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-user': String(user) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  let n = 0;
  const ok = (label) => console.log(`  ok ${++n}. ${label}`);

  let r = await call(1, 'POST', '', { title: 'Write report', description: 'draft', dueDate: '2026-11-05', priority: 'high' });
  assert.equal(r.status, 201);
  assert.equal(r.body.ownerId, 1);
  assert.equal(r.body.priority, 'HIGH');
  assert.equal(r.body.status, 'PENDING');
  const id = r.body.id;
  ok('TC-Task-01 create task (201, owner = signed-in user)');
  r = await call(1, 'POST', '', { description: 'no title' });
  assert.equal(r.status, 400);
  ok('create without title -> 400');
  await pool.query('UPDATE tasks SET list_id = 1, assignee_id = 5 WHERE id = $1', [id]);

  r = await call(1, 'GET', '');
  assert.equal(r.body.tasks.length, 1);
  ok('owner sees the task in the list');
  r = await call(2, 'GET', '');
  assert.equal(r.body.tasks.length, 0);
  ok('TC-Sec-03 stranger does not see it in the list');
  r = await call(3, 'GET', '');
  assert.equal(r.body.tasks.length, 1);
  ok('a VIEW-share user sees it in the list');

  r = await call(1, 'PATCH', `/${id}`, { title: 'Write final report', dueDate: null });
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Write final report');
  assert.equal(r.body.dueDate, null);
  ok('TC-Task-02 owner edits title and clears due date');
  r = await call(4, 'PATCH', `/${id}`, { priority: 'low' });
  assert.equal(r.status, 200);
  ok('EDIT-share user can edit');
  for (const [u, label] of [[2, 'stranger'], [3, 'VIEW-share user'], [5, 'assignee']]) {
    r = await call(u, 'PATCH', `/${id}`, { title: 'hacked' });
    assert.equal(r.status, 403, label);
    ok(`TC-Sec-03 ${label} cannot edit -> 403`);
  }
  r = await call(1, 'PATCH', '/9999', { title: 'x' });
  assert.equal(r.status, 404);
  ok('edit missing task -> 404');

  r = await call(5, 'POST', `/${id}/complete`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'COMPLETED');
  assert.ok(r.body.completedAt);
  const firstDone = r.body.completedAt;
  ok('TC-Task-04 assignee completes task, completion time set');
  r = await call(1, 'POST', `/${id}/complete`);
  assert.equal(r.body.completedAt, firstDone);
  ok('completing again keeps the first completion time');
  r = await call(3, 'POST', `/${id}/reopen`);
  assert.equal(r.status, 403);
  ok('VIEW-share user cannot reopen -> 403');
  r = await call(1, 'POST', `/${id}/reopen`);
  assert.equal(r.body.status, 'PENDING');
  assert.equal(r.body.completedAt, null);
  ok('TC-Task-04 owner reopens, completion time cleared');
  r = await call(1, 'POST', `/${id}/reopen`);
  assert.equal(r.status, 409);
  ok('reopening a task that is not completed -> 409');
  r = await call(1, 'PATCH', `/${id}`, { status: 'completed' });
  assert.equal(r.body.status, 'COMPLETED');
  assert.ok(r.body.completedAt);
  ok('editing status to completed sets the completion time');
  r = await call(1, 'PATCH', `/${id}`, { status: 'in_progress' });
  assert.equal(r.body.status, 'IN_PROGRESS');
  assert.equal(r.body.completedAt, null);
  ok('editing status to in_progress clears the completion time');

  for (const [u, label] of [[2, 'stranger'], [3, 'VIEW-share user'], [4, 'EDIT-share user'], [5, 'assignee']]) {
    r = await call(u, 'DELETE', `/${id}`);
    assert.equal(r.status, 403, label);
    ok(`TC-Sec-03 ${label} cannot delete -> 403`);
  }
  r = await call(1, 'DELETE', `/${id}`);
  assert.equal(r.status, 204);
  ok('TC-Task-03 owner deletes (204)');
  const row = (await pool.query('SELECT deleted_at FROM tasks WHERE id = $1', [id])).rows[0];
  assert.ok(row && row.deleted_at);
  ok('the row stays with deleted_at set (30-day recovery)');
  const audit = (await pool.query('SELECT actor_id, action, target_id, outcome FROM audit_log')).rows;
  assert.deepEqual(audit, [{ actor_id: 1, action: 'TASK_DELETED', target_id: id, outcome: 'SUCCESS' }]);
  ok('audit_log has one TASK_DELETED entry by the owner');
  r = await call(1, 'DELETE', `/${id}`);
  assert.equal(r.status, 404);
  ok('deleting again -> 404');
  r = await call(1, 'PATCH', `/${id}`, { title: 'zombie' });
  assert.equal(r.status, 404);
  ok('editing a deleted task -> 404');
  r = await call(1, 'GET', '');
  assert.equal(r.body.tasks.length, 0);
  ok('a deleted task no longer appears in the list');

  console.log(`\nALL ${n} CHECKS PASSED`);
  server.close();
  await pool.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
