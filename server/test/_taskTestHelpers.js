// Shared helpers for task tests. Not a test file itself.
const express = require('express');
const errorHandler = require('../src/middleware/errorHandler');

// Mock database: records every query and answers with whatever `answer(sql, params)` returns.
function makeDb(answer) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return answer(sql, params, calls);
    },
  };
}

// Starts an Express app with `mount(app)` and runs fn(baseUrl). The signed-in user is req.user.
function withServer(mount, fn, user = { id: 42, role: 'USER' }) {
  return async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = user; next(); });
    mount(app);
    app.use(errorHandler);
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  };
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

module.exports = { makeDb, withServer, json };
