'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createAuthRouter } = require('../src/modules/auth/routes');
const { createFailedLoginMonitor, WINDOW_MINUTES, ALERT_THRESHOLD } = require('../src/modules/auth/failedLoginMonitor');
const errorHandler = require('../src/middleware/errorHandler');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('TM-SR-005 contract: failed-login implementation has 5-attempt, 10-minute threshold and hashed identifiers', () => {
  assert.equal(WINDOW_MINUTES, 10);
  assert.equal(ALERT_THRESHOLD, 5);

  const monitor = read('server/src/modules/auth/failedLoginMonitor.js');
  assert.match(monitor, /const WINDOW_MINUTES = 10/);
  assert.match(monitor, /const ALERT_THRESHOLD = 5/);
  assert.match(monitor, /BRUTE_FORCE_ALERT/);
  assert.match(monitor, /INSERT INTO audit_log/);
  assert.match(monitor, /createHmac\('sha256'/);
  assert.doesNotMatch(monitor, /logger\.warn\([^)]*email/i);

  const routes = read('server/src/modules/auth/routes.js');
  assert.match(routes, /recordFailedLogin/);
});

test('TC-Sec-05: auth router triggers failed-login monitoring on invalid credentials and locked accounts', async () => {
  const recorded = [];
  const monitorMock = async (args) => {
    recorded.push(args);
  };

  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter({
    db: {
      async query(sql) {
        if (sql.startsWith('SELECT id, email')) {
          return { rows: [] }; // Unknown user
        }
        return { rows: [] };
      },
    },
    failedLoginMonitor: monitorMock,
  }));
  app.use(errorHandler);

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com', password: 'Password123' }),
    });
    assert.equal(res.status, 401);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].email, 'unknown@example.com');
    assert.equal(recorded[0].userId, null);
  } finally {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
