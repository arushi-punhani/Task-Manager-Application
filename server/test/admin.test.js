const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const errorHandler = require('../src/middleware/errorHandler');
const { createAdminRouter } = require('../src/modules/admin/routes');

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', router);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  try {
    // listen() is asynchronous. Wait until the OS has bound the ephemeral port
    // before reading server.address() or issuing HTTP requests.
    await once(server, 'listening');
    await run(`http://127.0.0.1:${server.address().port}/api/v1/admin`);
  } finally {
    // Only close a server that successfully started listening.
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }
}

function testAuth(role = 'ADMIN', id = 99) {
  return (req, res, next) => {
    req.user = { id, role };
    next();
  };
}

function jsonResponse(rows) {
  return { rows };
}

test('admin user list returns public fields and bounded pagination', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('COUNT(*)')) return jsonResponse([{ total: '1' }]);
      if (sql.includes('INSERT INTO audit_log')) return jsonResponse([{ id: 90 }]);
      return jsonResponse([{
        id: 12,
        email: 'member@example.test',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        createdAt: '2026-10-01T12:00:00.000Z',
      }]);
    },
  };

  await withServer(createAdminRouter({ db, authMiddleware: testAuth() }), async (base) => {
    const response = await fetch(`${base}/users?limit=25&offset=10`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.users, [{
      id: 12,
      email: 'member@example.test',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
      createdAt: '2026-10-01T12:00:00.000Z',
    }]);
    assert.deepEqual(body.pagination, { limit: 25, offset: 10, total: 1 });
    assert.equal(JSON.stringify(body).includes('password_hash'), false);
    assert.equal(calls.length, 3);
    assert.ok(calls.some((call) => call.sql.includes('ORDER BY created_at DESC')));
    assert.deepEqual(calls.find((call) => call.params?.length === 2)?.params, [25, 10]);
    const listingAudit = calls.find((call) => call.sql.includes('INSERT INTO audit_log'));
    assert.match(listingAudit.sql, /USERS_LISTED/);
    assert.deepEqual(listingAudit.params, [99]);
  });
});

test('admin user list rejects invalid pagination', async () => {
  let queried = false;
  const db = { async query() { queried = true; return jsonResponse([]); } };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth() }), async (base) => {
    const response = await fetch(`${base}/users?limit=1000`);
    assert.equal(response.status, 400);
    assert.equal(queried, false);
  });
});

test('non-admin users receive 403 and cannot query the admin user list', async () => {
  let queried = false;
  const db = { async query() { queried = true; return jsonResponse([]); } };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth('USER', 7) }), async (base) => {
    const response = await fetch(`${base}/users`);
    assert.equal(response.status, 403);
    assert.equal(queried, false);
  });
});

test('disabling a user updates status, revokes active sessions, and writes an audit entry', async () => {
  let call;
  const db = {
    async query(sql, params) {
      call = { sql, params };
      return jsonResponse([{
        id: 12,
        email: 'member@example.test',
        role: 'USER',
        status: 'DISABLED',
        emailVerified: true,
        createdAt: '2026-10-01T12:00:00.000Z',
      }]);
    },
  };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth('ADMIN', 99) }), async (base) => {
    const response = await fetch(`${base}/users/12/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.user.status, 'DISABLED');
    assert.deepEqual(call.params, ['DISABLED', 12, 99]);
    assert.match(call.sql, /UPDATE auth_sessions/i);
    assert.match(call.sql, /INSERT INTO audit_log/i);
    assert.match(call.sql, /USER_DISABLED/);
  });
});

test('enabling a user writes a USER_ENABLED audit entry', async () => {
  let call;
  const db = {
    async query(sql, params) {
      call = { sql, params };
      return jsonResponse([{
        id: 12,
        email: 'member@example.test',
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
        createdAt: '2026-10-01T12:00:00.000Z',
      }]);
    },
  };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth() }), async (base) => {
    const response = await fetch(`${base}/users/12/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(call.params, ['ACTIVE', 12, 99]);
    assert.match(call.sql, /USER_ENABLED/);
  });
});

test('status update rejects invalid IDs, statuses, and self-disable attempts', async () => {
  let queried = false;
  const db = { async query() { queried = true; return jsonResponse([]); } };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth('ADMIN', 99) }), async (base) => {
    const badId = await fetch(`${base}/users/abc/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'DISABLED' }),
    });
    const badStatus = await fetch(`${base}/users/12/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SUSPENDED' }),
    });
    const selfDisable = await fetch(`${base}/users/99/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(badId.status, 400);
    assert.equal(badStatus.status, 400);
    assert.equal(selfDisable.status, 409);
    assert.equal(queried, false);
  });
});

test('status update returns 404 when the target user does not exist', async () => {
  const db = { async query() { return jsonResponse([]); } };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth() }), async (base) => {
    const response = await fetch(`${base}/users/123/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(response.status, 404);
  });
});

test('deleting a user is audited and prevents deleting the current administrator', async () => {
  let call;
  const db = {
    async query(sql, params) {
      call = { sql, params };
      return jsonResponse([{ id: 12 }]);
    },
  };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth('ADMIN', 99) }), async (base) => {
    const response = await fetch(`${base}/users/12`, { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { message: 'User deleted', userId: 12 });
    assert.deepEqual(call.params, [12, 99]);
    assert.match(call.sql, /DELETE FROM users/i);
    assert.match(call.sql, /INSERT INTO audit_log/i);
    assert.match(call.sql, /USER_DELETED/);

    const selfDelete = await fetch(`${base}/users/99`, { method: 'DELETE' });
    assert.equal(selfDelete.status, 409);
  });
});

test('deleting an unknown user returns 404 and writes no success response', async () => {
  const db = { async query() { return jsonResponse([]); } };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth() }), async (base) => {
    const response = await fetch(`${base}/users/123`, { method: 'DELETE' });
    assert.equal(response.status, 404);
  });
});
