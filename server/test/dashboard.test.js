const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const reportRouter = require('../src/modules/report/routes');
const errorHandler = require('../src/middleware/errorHandler');

const withDashboardServer = (db, fn) => async () => {
  const app = express();
  const testAuth = (req, res, next) => {
    req.user = { id: 42, role: 'USER' };
    next();
  };
  app.use('/api/v1', reportRouter.createReportRouter({ db, authMiddleware: testAuth }));
  app.use(errorHandler);

  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/v1`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

test('TC-Report-01: dashboard summary returns status and overdue counts for the signed-in user', withDashboardServer({
  async query(sql, params) {
    assert.deepEqual(params, [42]);
    assert.match(sql, /t\.status = 'PENDING'/);
    assert.match(sql, /t\.status = 'IN_PROGRESS'/);
    assert.match(sql, /t\.status = 'COMPLETED'/);
    assert.match(sql, /t\.status <> 'COMPLETED'[\s\S]*t\.due_date < CURRENT_TIMESTAMP/);
    assert.match(sql, /t\.deleted_at IS NULL/);
    assert.match(sql, /t\.owner_id = \$1/);
    assert.match(sql, /t\.assignee_id = \$1/);
    assert.match(sql, /list_shares/);
    return {
      rows: [{ pending: '2', inProgress: '3', completed: '4', overdue: '1' }],
    };
  },
}, async (base) => {
  const response = await fetch(`${base}/dashboard/summary`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    pending: 2,
    inProgress: 3,
    completed: 4,
    overdue: 1,
  });
}));

test('TC-Report-01: dashboard summary returns zero counts when the user has no visible tasks', withDashboardServer({
  async query() {
    // PostgreSQL aggregate queries without GROUP BY return one row of zero counts on empty input.
    return { rows: [{ pending: 0, inProgress: 0, completed: 0, overdue: 0 }] };
  },
}, async (base) => {
  const response = await fetch(`${base}/dashboard/summary`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
  });
}));

test('dashboard summary passes database errors to the standard error handler', withDashboardServer({
  async query() {
    throw new Error('database unavailable');
  },
}, async (base) => {
  const response = await fetch(`${base}/dashboard/summary`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error' });
}));
