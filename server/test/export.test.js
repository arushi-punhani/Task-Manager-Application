'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const reportRouter = require('../src/modules/report/routes');
const errorHandler = require('../src/middleware/errorHandler');

const withExportServer = (db, fn) => async () => {
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

test('TC-Report-02: export tasks returns CSV with correct headers and user tasks', withExportServer({
  async query(sql, params) {
    assert.deepEqual(params, [42]);
    assert.match(sql, /t\.deleted_at IS NULL/);
    assert.match(sql, /t\.owner_id = \$1/);
    assert.match(sql, /t\.assignee_id = \$1/);
    assert.match(sql, /FROM list_shares ls/);
    return {
      rows: [
        {
          id: 101,
          title: 'Review project roadmap',
          description: 'Quarterly review',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          due_date: '2026-11-20T12:00:00.000Z',
          created_at: '2026-11-01T08:00:00.000Z',
          completed_at: null,
          owner_email: 'user@example.com',
          assignee_email: 'user@example.com',
          list_name: 'Sprint 2',
          tags: 'planning, roadmap',
        },
      ],
    };
  },
}, async (base) => {
  const response = await fetch(`${base}/tasks/export?format=csv`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(response.headers.get('content-disposition'), /attachment;\s*filename="tasks-export-\d+\.csv"/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer[0], 0xef);
  assert.equal(buffer[1], 0xbb);
  assert.equal(buffer[2], 0xbf);
  const text = buffer.toString('utf8');
  assert.match(text, /Task ID,Title,Description/);
  assert.match(text, /101,Review project roadmap/);
}));

test('TC-Report-02: export tasks returns 501 when requesting format=pdf', withExportServer({
  async query() {
    return { rows: [] };
  },
}, async (base) => {
  const response = await fetch(`${base}/tasks/export?format=pdf`);
  assert.equal(response.status, 501);
  const data = await response.json();
  assert.match(data.error, /PDF export is not included in this release/);
}));

test('TC-Report-02: export tasks returns 400 when format is unsupported', withExportServer({
  async query() {
    return { rows: [] };
  },
}, async (base) => {
  const response = await fetch(`${base}/tasks/export?format=xml`);
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.match(data.error, /Unsupported export format/);
}));
