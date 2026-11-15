
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCollabRouter } = require('../src/modules/collab/routes');
const errorHandler = require('../src/middleware/errorHandler');

async function withServer(db, run, mailer = async () => {}) {
  const app = express();
  app.use(express.json());

  app.use('/api/v1', createCollabRouter({
    db,
    mailer,
    authMiddleware(req, res, next) {
      req.user = { id: 7, role: 'USER' };
      next();
    }
  }));

  app.use(errorHandler);

  const server = app.listen(0);

  try {
    await run(`http://127.0.0.1:${server.address().port}/api/v1`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('assign endpoint assigns task and notifies teammate', async () => {
  const queries = [];
  const sentEmails = [];

  await withServer({
    async query(sql, params) {
      queries.push(sql);

      if (sql.includes('UPDATE tasks SET assignee_id')) {
        assert.deepEqual(params, [12, 3, 7]);

        return {
          rows: [{
            id: 3,
            title: 'Demo task',
            assignee_id: 12
          }]
        };
      }

      if (sql.includes('SELECT email FROM users')) {
        assert.deepEqual(params, [12]);

        return {
          rows: [{ email: 'teammate@example.com' }]
        };
      }

      if (sql.includes('INSERT INTO notifications')) {
        assert.deepEqual(params, [12, 3]);
        assert.match(sql, /TASK_ASSIGNED/);
        assert.match(sql, /IN_APP/);
        assert.match(sql, /EMAIL/);

        return { rows: [] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    }
  }, async base => {
    const res = await fetch(`${base}/tasks/3/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assigneeId: 12 })
    });

    assert.equal(res.status, 200);

    const body = await res.json();

    assert.equal(body.task.assignee_id, 12);
    assert.equal(queries.length, 3);
  }, async email => {
    sentEmails.push(email);
  });

  assert.deepEqual(sentEmails, [{
    to: 'teammate@example.com',
    taskTitle: 'Demo task'
  }]);
});

test('assign endpoint validates the assignee ID', async () => {
  await withServer(
    { async query() {
      throw Error('Should not query');
    } },
    async base => {
      const res = await fetch(`${base}/tasks/3/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigneeId: 'invalid' })
      });

      assert.equal(res.status, 400);
    }
  );
});

test('comment endpoint creates a comment for an accessible task', async () => {
  await withServer({
    async query(sql, params) {
      if (sql.includes('SELECT t.id')) {
        assert.deepEqual(params, [3, 7]);
        return {
          rows: [{
            id: 3,
            access: 'OWNER'
          }]
        };
      }

      assert.match(sql, /INSERT INTO comments/);
      assert.deepEqual(params, [3, 7, 'Hello team']);

      return {
        rows: [{
          id: 9,
          task_id: 3,
          author_id: 7,
          text: 'Hello team'
        }]
      };
    }
  }, async base => {
    const res = await fetch(`${base}/tasks/3/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '  Hello team  ' })
    });

    assert.equal(res.status, 201);
    assert.equal((await res.json()).comment.text, 'Hello team');
  });
});

test('comment endpoint rejects empty comments', async () => {
  await withServer(
    { async query() {
      throw Error('Should not query');
    } },
    async base => {
      const res = await fetch(`${base}/tasks/3/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '   ' })
      });

      assert.equal(res.status, 400);
    }
  );
});

test('VIEW permission cannot add comments', async () => {
  let commentInserted = false;

  await withServer({
    async query(sql) {
      if (sql.includes('SELECT t.id')) {
        return {
          rows: [{
            id: 3,
            access: 'VIEW'
          }]
        };
      }

      if (sql.includes('INSERT INTO comments')) {
        commentInserted = true;
      }

      throw new Error(`Unexpected query: ${sql}`);
    }
  }, async base => {
    const res = await fetch(`${base}/tasks/3/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'View-only user comment' })
    });

    assert.equal(res.status, 403);

    const body = await res.json();
    assert.equal(
      body.error,
      'You do not have permission to comment on this task'
    );
  });

  assert.equal(commentInserted, false);
});
