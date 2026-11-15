
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  createNotificationsRouter
} = require('../src/modules/notif/routes');
const errorHandler = require('../src/middleware/errorHandler');

async function withServer(db, run, userId = 12) {
  const app = express();
  app.use(express.json());

  app.use('/api/v1/notifications', createNotificationsRouter({
    db,
    authMiddleware(req, res, next) {
      req.user = { id: userId, role: 'USER' };
      next();
    }
  }));

  app.use(errorHandler);

  const server = app.listen(0);

  try {
    await run(`http://127.0.0.1:${server.address().port}/api/v1/notifications`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('GET notifications returns current user in-app notifications', async () => {
  await withServer({
    async query(sql, params) {
      assert.match(sql, /FROM notifications/);
      assert.match(sql, /user_id = \$1/);
      assert.match(sql, /channel = 'IN_APP'/);
      assert.deepEqual(params, [12]);

      return {
        rows: [{
          id: 1,
          type: 'TASK_ASSIGNED',
          task_id: 3,
          channel: 'IN_APP',
          sent_at: '2026-11-15T10:00:00Z',
          read_at: null
        }]
      };
    }
  }, async url => {
    const res = await fetch(url);

    assert.equal(res.status, 200);

    const body = await res.json();

    assert.equal(body.notifications.length, 1);
    assert.equal(body.notifications[0].type, 'TASK_ASSIGNED');
    assert.equal(body.notifications[0].task_id, 3);
  });
});

test('GET notifications returns an empty array when user has no notifications', async () => {
  await withServer({
    async query(sql, params) {
      assert.deepEqual(params, [12]);
      return { rows: [] };
    }
  }, async url => {
    const res = await fetch(url);

    assert.equal(res.status, 200);

    const body = await res.json();

    assert.deepEqual(body.notifications, []);
  });
});

test('GET notifications uses the authenticated user ID', async () => {
  await withServer({
    async query(sql, params) {
      assert.deepEqual(params, [25]);
      return { rows: [] };
    }
  }, async url => {
    const res = await fetch(url);

    assert.equal(res.status, 200);
  }, 25);
});

test('GET notifications forwards database errors', async () => {
  await withServer({
    async query() {
      throw new Error('Database unavailable');
    }
  }, async url => {
    const res = await fetch(url);

    assert.equal(res.status, 500);
  });
});
