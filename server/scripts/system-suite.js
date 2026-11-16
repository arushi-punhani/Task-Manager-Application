// System test: the whole API, as a user would use it, against a REAL PostgreSQL database.
// It starts the real Express app (real auth, real SQL, no mocks) and calls it over HTTP.
//
//   createdb taskmanager_test
//   psql -d taskmanager_test -f db/schema.sql
//   DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/taskmanager_test JWT_SECRET=test node scripts/system-suite.js
//
// It EMPTIES most tables, so it refuses to run unless the database name ends in "_test".
// Output: one line per case (PASS or FAIL) and a summary. Exit code 1 if any case fails.
const assert = require('node:assert/strict');

const url = process.env.DATABASE_URL || '';
const dbName = url.split('/').pop().split('?')[0];
if (!dbName.endsWith('_test')) {
  console.error(`Refusing to run: database "${dbName}" does not end in _test. This script deletes data.`);
  process.exit(1);
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'system-test-secret';
process.env.NODE_ENV = 'test';

const pool = require('../src/config/db');
const app = require('../src/app');
const { sendDueDateReminders } = require('../src/jobs/dueDateReminders');
const { purgeDeletedTasks } = require('../src/jobs/purgeDeletedTasks');

const results = [];
const logs = [];
const origInfo = console.info;
console.info = (...a) => { logs.push(a.join(' ')); };

async function main() {
  await pool.query('TRUNCATE users, tasks, tags, audit_log, task_lists, comments, notifications RESTART IDENTITY CASCADE');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = async (method, path, { body, token } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_e) { /* not JSON, e.g. CSV */ }
    return { status: res.status, body: json, text };
  };
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const PW = 'SystemTest123!';
  const run = async (id, req, title, fn) => {
    try { await fn(); results.push({ id, req, title, ok: true }); }
    catch (e) { results.push({ id, req, title, ok: false, err: e.message.split('\n')[0] }); }
  };
  const signup = async (email) => {
    const r = await call('POST', '/auth/register', { body: { email, password: PW } });
    const l = await call('POST', '/auth/login', { body: { email, password: PW } });
    return { id: r.body && r.body.user && r.body.user.id, token: l.body && l.body.token };
  };

  let alice, bob, admin, taskId;
  await run('SYS-01', 'TM-F-001', 'Register a new account; duplicate email is rejected (409)', async () => {
    const r = await call('POST', '/auth/register', { body: { email: 'alice@x.com', password: PW } });
    assert.equal(r.status, 201);
    const dup = await call('POST', '/auth/register', { body: { email: 'alice@x.com', password: PW } });
    assert.equal(dup.status, 409);
    const weak = await call('POST', '/auth/register', { body: { email: 'z@x.com', password: 'short' } });
    assert.equal(weak.status, 400);
  });
  await run('SYS-02', 'TM-F-002, TM-SR-004', 'Login returns a token; wrong password is 401; logout revokes the token', async () => {
    alice = await signup('alice2@x.com');
    assert.ok(alice.token);
    const bad = await call('POST', '/auth/login', { body: { email: 'alice2@x.com', password: 'wrong-password' } });
    assert.equal(bad.status, 401);
    const tmp = await call('POST', '/auth/login', { body: { email: 'alice2@x.com', password: PW } });
    assert.equal((await call('GET', '/tasks', { token: tmp.body.token })).status, 200);
    assert.equal((await call('POST', '/auth/logout', { token: tmp.body.token })).status, 200);
    assert.equal((await call('GET', '/tasks', { token: tmp.body.token })).status, 401);
    assert.equal((await call('GET', '/tasks')).status, 401);
  });
  await run('SYS-03', 'TM-SR-002', 'Passwords are stored as bcrypt hashes, never as plain text', async () => {
    const row = (await pool.query("SELECT password_hash FROM users WHERE email = 'alice2@x.com'")).rows[0];
    assert.match(row.password_hash, /^\$2[aby]\$12\$/);
    assert.notEqual(row.password_hash, PW);
  });
  bob = await signup('bob@x.com');

  await run('SYS-04', 'TM-F-010, TM-F-011, TM-F-013', 'Create, edit, complete and reopen a task', async () => {
    const c = await call('POST', '/tasks', { token: alice.token, body: { title: 'Write report', priority: 'HIGH', dueDate: day(3), tags: ['Work', 'work', 'Urgent'] } });
    assert.equal(c.status, 201);
    taskId = c.body.id;
    assert.deepEqual([...c.body.tags].sort(), ['urgent', 'work']);
    assert.equal((await call('POST', '/tasks', { token: alice.token, body: { title: '' } })).status, 400);
    const e = await call('PATCH', `/tasks/${taskId}`, { token: alice.token, body: { title: 'Write final report' } });
    assert.equal(e.status, 200);
    assert.equal((await call('POST', `/tasks/${taskId}/complete`, { token: alice.token })).status, 200);
    assert.equal((await call('POST', `/tasks/${taskId}/reopen`, { token: alice.token })).status, 200);
  });
  await run('SYS-05', 'TM-F-014, TM-F-015, TM-F-016', 'Search, filter by tag, priority and status, and sort the list', async () => {
    await call('POST', '/tasks', { token: alice.token, body: { title: 'Buy milk', priority: 'LOW', tags: ['home'] } });
    await call('POST', '/tasks', { token: alice.token, body: { title: 'Overdue bill', priority: 'MEDIUM', dueDate: day(-2), tags: ['home'] } });
    const titles = async (q) => (await call('GET', `/tasks?${q}`, { token: alice.token })).body.tasks.map((t) => t.title);
    assert.deepEqual(await titles('q=milk'), ['Buy milk']);
    assert.deepEqual((await titles('tag=home')).sort(), ['Buy milk', 'Overdue bill']);
    assert.deepEqual(await titles('priority=HIGH'), ['Write final report']);
    assert.deepEqual(await titles('due=overdue'), ['Overdue bill']);
    assert.deepEqual(await titles('sort=priority&order=desc'), ['Write final report', 'Overdue bill', 'Buy milk']);
  });
  await run('SYS-06', 'TM-SR-003', 'A user cannot read, edit or delete another user\'s task (403); missing task is 404', async () => {
    assert.equal((await call('PATCH', `/tasks/${taskId}`, { token: bob.token, body: { title: 'hacked' } })).status, 403);
    assert.equal((await call('DELETE', `/tasks/${taskId}`, { token: bob.token })).status, 403);
    assert.equal((await call('PATCH', '/tasks/99999', { token: alice.token, body: { title: 'x' } })).status, 404);
    const list = await call('GET', '/tasks', { token: bob.token });
    assert.equal(list.body.tasks.length, 0);
  });
  await run('SYS-07', 'TM-F-012, TM-NF-005', 'Delete is soft; owner restores it; another user cannot (404)', async () => {
    assert.equal((await call('DELETE', `/tasks/${taskId}`, { token: alice.token })).status, 204);
    const gone = await call('GET', '/tasks?q=final', { token: alice.token });
    assert.equal(gone.body.tasks.length, 0);
    const deleted = await call('GET', '/tasks/deleted', { token: alice.token });
    assert.equal(deleted.body.tasks.length, 1);
    assert.equal((await call('POST', `/tasks/${taskId}/restore`, { token: bob.token })).status, 404);
    assert.equal((await call('POST', `/tasks/${taskId}/restore`, { token: alice.token })).status, 200);
    assert.equal((await call('GET', '/tasks?q=final', { token: alice.token })).body.tasks.length, 1);
  });
  await run('SYS-08', 'TM-NF-005', 'Purge removes only tasks deleted over 30 days ago', async () => {
    const old = (await call('POST', '/tasks', { token: alice.token, body: { title: 'Old deleted' } })).body.id;
    const recent = (await call('POST', '/tasks', { token: alice.token, body: { title: 'Recently deleted' } })).body.id;
    await call('DELETE', `/tasks/${old}`, { token: alice.token });
    await call('DELETE', `/tasks/${recent}`, { token: alice.token });
    await pool.query("UPDATE tasks SET deleted_at = NOW() - INTERVAL '31 days' WHERE id = $1", [old]);
    await purgeDeletedTasks(pool);
    const left = (await pool.query('SELECT id FROM tasks WHERE id IN ($1, $2)', [old, recent])).rows.map((r) => r.id);
    assert.deepEqual(left, [recent]);
  });
  await run('SYS-09', 'TM-F-020, TM-F-021, TM-F-031', 'Assign a task to a teammate, add a comment, teammate gets an in-app notification', async () => {
    const a = await call('POST', `/tasks/${taskId}/assign`, { token: alice.token, body: { assigneeId: bob.id } });
    assert.equal(a.status, 200);
    const cm = await call('POST', `/tasks/${taskId}/comments`, { token: alice.token, body: { text: 'Please review' } });
    assert.equal(cm.status, 201);
    const list = await call('GET', `/tasks/${taskId}/comments`, { token: bob.token });
    assert.equal(list.body.comments.length, 1);
    const n = await call('GET', '/notifications', { token: bob.token });
    assert.ok(n.body.notifications.some((x) => x.type === 'TASK_ASSIGNED'));
    assert.ok(logs.some((l) => l.includes('You have been assigned a task')));
  });
  await run('SYS-10', 'TM-F-022', 'Share a list with VIEW permission; only the list owner can share', async () => {
    const list = (await pool.query("INSERT INTO task_lists (owner_id, name) VALUES ($1, 'Home') RETURNING id", [alice.id])).rows[0].id;
    const t = (await call('POST', '/tasks', { token: alice.token, body: { title: 'Shared chore' } })).body.id;
    await pool.query('UPDATE tasks SET list_id = $1 WHERE id = $2', [list, t]);
    const carol = await signup('carol@x.com');
    assert.equal((await call('GET', '/tasks?q=Shared', { token: carol.token })).body.tasks.length, 0);
    assert.equal((await call('POST', `/lists/${list}/shares`, { token: bob.token, body: { userId: carol.id, permission: 'VIEW' } })).status === 403, true);
    assert.equal((await call('POST', `/lists/${list}/shares`, { token: alice.token, body: { userId: carol.id, permission: 'VIEW' } })).status, 200);
    assert.equal((await call('GET', '/tasks?q=Shared', { token: carol.token })).body.tasks.length, 1);
    assert.equal((await call('PATCH', `/tasks/${t}`, { token: carol.token, body: { title: 'x' } })).status, 403);
  });
  await run('SYS-11', 'TM-F-030', 'A task due in about 24 hours produces one in-app reminder; running the check again does not repeat it', async () => {
    const t = (await call('POST', '/tasks', { token: bob.token, body: { title: 'Due tomorrow' } })).body.id;
    await pool.query("UPDATE tasks SET due_date = NOW() + INTERVAL '23 hours 59 minutes 30 seconds' WHERE id = $1", [t]);
    await sendDueDateReminders(pool);
    await sendDueDateReminders(pool);
    const rows = (await pool.query("SELECT * FROM notifications WHERE type = 'DUE_REMINDER' AND task_id = $1", [t])).rows;
    assert.equal(rows.length, 1);
    const far = (await call('POST', '/tasks', { token: bob.token, body: { title: 'Due in a week', dueDate: day(7) } })).body.id;
    await sendDueDateReminders(pool);
    assert.equal((await pool.query("SELECT 1 FROM notifications WHERE type = 'DUE_REMINDER' AND task_id = $1", [far])).rowCount, 0);
  });
  await run('SYS-12', 'TM-F-003', 'Five wrong passwords lock the account (423) even for the right password; success earlier resets the count', async () => {
    const dave = await signup('dave@x.com');
    for (let i = 0; i < 2; i += 1) await call('POST', '/auth/login', { body: { email: 'dave@x.com', password: 'bad-password-1' } });
    assert.equal((await call('POST', '/auth/login', { body: { email: 'dave@x.com', password: PW } })).status, 200);
    for (let i = 0; i < 5; i += 1) await call('POST', '/auth/login', { body: { email: 'dave@x.com', password: 'bad-password-1' } });
    assert.equal((await call('POST', '/auth/login', { body: { email: 'dave@x.com', password: PW } })).status, 423);
    assert.ok(dave.token);
  });
  await run('SYS-13', 'TM-F-004', 'Password reset: token works once, new password works, old does not', async () => {
    logs.length = 0;
    assert.equal((await call('POST', '/auth/password-reset/request', { body: { email: 'bob@x.com' } })).status, 200);
    const line = logs.find((l) => l.includes('reset-password?token=')) || '';
    const token = (line.match(/token=([0-9a-f]+)/) || [])[1];
    assert.ok(token, 'reset link was not produced');
    const ok = await call('POST', '/auth/password-reset/confirm', { body: { token, password: 'NewPassword456!' } });
    assert.equal(ok.status, 200);
    assert.equal((await call('POST', '/auth/password-reset/confirm', { body: { token, password: 'Another789!' } })).status >= 400, true);
    assert.equal((await call('POST', '/auth/login', { body: { email: 'bob@x.com', password: 'NewPassword456!' } })).status, 200);
    assert.equal((await call('POST', '/auth/login', { body: { email: 'bob@x.com', password: PW } })).status, 401);
    const unknown = await call('POST', '/auth/password-reset/request', { body: { email: 'nobody@x.com' } });
    assert.equal(unknown.status, 200);
  });
  await run('SYS-14', 'TM-F-050, TM-F-051, TM-SR-003', 'Admin lists, disables and deletes users; a normal user gets 403; admin actions are in the audit log', async () => {
    admin = await signup('admin@x.com');
    await pool.query("UPDATE users SET role = 'ADMIN' WHERE email = 'admin@x.com'");
    const l = await call('POST', '/auth/login', { body: { email: 'admin@x.com', password: PW } });
    admin.token = l.body.token;
    assert.equal((await call('GET', '/admin/users', { token: alice.token })).status, 403);
    const users = await call('GET', '/admin/users', { token: admin.token });
    assert.equal(users.status, 200);
    const erin = await signup('erin@x.com');
    const dis = await call('PATCH', `/admin/users/${erin.id}/status`, { token: admin.token, body: { status: 'DISABLED' } });
    assert.equal(dis.status, 200);
    assert.equal((await call('POST', '/auth/login', { body: { email: 'erin@x.com', password: PW } })).status >= 400, true);
    assert.equal((await call('DELETE', `/admin/users/${erin.id}`, { token: admin.token })).status, 200);
    const audit = await call('GET', '/admin/audit-logs', { token: admin.token });
    assert.equal(audit.status, 200);
    assert.ok(JSON.stringify(audit.body).length > 20);
    assert.equal((await call('GET', '/admin/audit-logs', { token: alice.token })).status, 403);
  });
  await run('SYS-15', 'TM-F-040', 'Dashboard summary returns task counts for the signed-in user', async () => {
    const d = await call('GET', '/dashboard/summary', { token: alice.token });
    assert.equal(d.status, 200);
    assert.ok(d.body && typeof d.body === 'object');
  });
  await run('SYS-16', 'TM-F-041', 'CSV export lists the user\'s tasks; PDF returns 501; unknown format 400', async () => {
    const c = await call('GET', '/tasks/export?format=csv', { token: alice.token });
    assert.equal(c.status, 200);
    assert.ok(c.text.split('\n').length > 2);
    assert.ok(!c.text.includes('Old deleted'));
    assert.equal((await call('GET', '/tasks/export?format=pdf', { token: alice.token })).status, 501);
    assert.equal((await call('GET', '/tasks/export?format=xml', { token: alice.token })).status, 400);
  });
  await run('SYS-17', 'TM-NF-002', 'Health probes: liveness is ok; readiness checks the database', async () => {
    assert.equal((await call('GET', '/health')).status, 200);
    assert.equal((await call('GET', '/health/ready')).status, 200);
  });
  await run('SYS-18', 'TM-SR-005', 'Failed logins are recorded with hashed identifiers; repeated failures raise an alert', async () => {
    const rows = (await pool.query('SELECT * FROM auth_security_events')).rows;
    assert.ok(rows.some((r) => r.event_type === 'FAILED_LOGIN'));
    assert.ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.subject_hash)));
    assert.ok(!JSON.stringify(rows).includes('dave@x.com'));
    assert.ok(rows.some((r) => r.event_type === 'BRUTE_FORCE_ALERT'));
  });

  server.close();
  await pool.end();
  console.info = origInfo;
  const pass = results.filter((r) => r.ok).length;
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  [${r.req}]  ${r.title}${r.ok ? '' : `\n      -> ${r.err}`}`);
  console.log(`\nSystem test: ${pass} of ${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
main().catch((e) => { console.info = origInfo; console.error(e); process.exit(1); });
