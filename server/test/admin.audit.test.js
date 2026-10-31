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
    await once(server, 'listening');
    await run(`http://127.0.0.1:${server.address().port}/api/v1/admin`);
  } finally {
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

test('TC-Admin-02: audit log returns action, administrator identity, timestamp and paginated results', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/COUNT\(\*\)/i.test(sql)) return jsonResponse([{ total: '3' }]);
      return jsonResponse([{
        id: 17,
        actorId: 99,
        actorEmail: 'admin@example.test',
        action: 'USER_DISABLED',
        targetId: 12,
        timestamp: '2026-10-30T18:00:00.000Z',
        outcome: 'SUCCESS',
      }]);
    },
  };

  await withServer(createAdminRouter({ db, authMiddleware: testAuth() }), async (base) => {
    const response = await fetch(`${base}/audit-logs?limit=10&offset=20`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.logs, [{
      id: 17,
      actorId: 99,
      actorEmail: 'admin@example.test',
      action: 'USER_DISABLED',
      targetId: 12,
      timestamp: '2026-10-30T18:00:00.000Z',
      outcome: 'SUCCESS',
    }]);
    assert.deepEqual(body.pagination, { limit: 10, offset: 20, total: 3 });
    const listCall = calls.find((call) => /FROM audit_log AS audit/i.test(call.sql));
    assert.ok(listCall);
    assert.deepEqual(listCall.params, [10, 20]);
    assert.match(listCall.sql, /LEFT JOIN users AS actor/i);
    assert.match(listCall.sql, /ORDER BY audit\.timestamp DESC, audit\.id DESC/i);
  });
});

test('TC-Admin-02: audit log rejects invalid pagination without querying the database', async () => {
  let queried = false;
  const db = { async query() { queried = true; return jsonResponse([]); } };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth() }), async (base) => {
    const response = await fetch(`${base}/audit-logs?limit=101`);
    assert.equal(response.status, 400);
    assert.equal(queried, false);
  });
});

test('TC-Admin-02: non-admin users cannot read the audit log', async () => {
  let queried = false;
  const db = { async query() { queried = true; return jsonResponse([]); } };
  await withServer(createAdminRouter({ db, authMiddleware: testAuth('USER', 7) }), async (base) => {
    const response = await fetch(`${base}/audit-logs`);
    assert.equal(response.status, 403);
    assert.equal(queried, false);
  });
});
