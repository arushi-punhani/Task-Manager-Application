
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCollabRouter } = require('../src/modules/collab/routes');
const errorHandler = require('../src/middleware/errorHandler');

async function withServer(db, run, currentUserId = 7) {
  const app = express();
  app.use(express.json());

  app.use('/api/v1', createCollabRouter({
    db,
    authMiddleware(req, res, next) {
      req.user = { id: currentUserId, role: 'USER' };
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

function sharingDb({ ownerId = 7, listExists = true, userExists = true } = {}) {
  const calls = [];

  return {
    calls,

    async query(sql, params) {
      calls.push({ sql, params });

      if (sql.includes('FROM task_lists')) {
        return {
          rows: listExists
            ? [{ id: 3, owner_id: ownerId }]
            : []
        };
      }

      if (sql.includes("FROM users") && sql.includes("status = 'ACTIVE'")) {
        return {
          rows: userExists ? [{ id: 12 }] : []
        };
      }

      if (sql.includes('INSERT INTO list_shares')) {
        return {
          rows: [{
            id: 1,
            list_id: params[0],
            user_id: params[1],
            permission: params[2]
          }]
        };
      }

      throw new Error(`Unexpected query: ${sql}`);
    }
  };
}

for (const permission of ['VIEW', 'EDIT']) {
  test(`TM-F-022: owner can share a list with ${permission} permission`, async () => {
    const db = sharingDb();

    await withServer(db, async base => {
      const res = await fetch(`${base}/lists/3/shares`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 12,
          permission
        })
      });

      assert.equal(res.status, 200);

      const body = await res.json();

      assert.deepEqual(body.share, {
        id: 1,
        list_id: 3,
        user_id: 12,
        permission
      });

      const insert = db.calls.find(call =>
        call.sql.includes('INSERT INTO list_shares')
      );

      assert.ok(insert);
      assert.match(insert.sql, /ON CONFLICT/);
      assert.deepEqual(insert.params, [3, 12, permission]);
    });
  });
}

test('TM-F-022: existing share permission can be updated', async () => {
  const db = sharingDb();

  await withServer(db, async base => {
    const res = await fetch(`${base}/lists/3/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 12,
        permission: 'EDIT'
      })
    });

    assert.equal(res.status, 200);
    assert.match(
      db.calls[2].sql,
      /DO UPDATE SET permission = EXCLUDED\.permission/
    );
  });
});

test('TM-F-022: non-owner cannot share another user list', async () => {
  const db = sharingDb({ ownerId: 99 });

  await withServer(db, async base => {
    const res = await fetch(`${base}/lists/3/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 12,
        permission: 'VIEW'
      })
    });

    assert.equal(res.status, 403);
    assert.equal(db.calls.length, 1);
  });
});

test('TM-F-022: invalid permission is rejected', async () => {
  const db = sharingDb();

  await withServer(db, async base => {
    const res = await fetch(`${base}/lists/3/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 12,
        permission: 'DELETE'
      })
    });

    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });
});

test('TM-F-022: missing list returns 404', async () => {
  const db = sharingDb({ listExists: false });

  await withServer(db, async base => {
    const res = await fetch(`${base}/lists/3/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 12,
        permission: 'VIEW'
      })
    });

    assert.equal(res.status, 404);
    assert.equal(db.calls.length, 1);
  });
});

test('TM-F-022: inactive or missing teammate returns 404', async () => {
  const db = sharingDb({ userExists: false });

  await withServer(db, async base => {
    const res = await fetch(`${base}/lists/3/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 12,
        permission: 'VIEW'
      })
    });

    assert.equal(res.status, 404);
    assert.equal(db.calls.length, 2);
  });
});

test('TM-F-022: owner cannot share a list with themselves', async () => {
  const db = sharingDb();

  await withServer(db, async base => {
    const res = await fetch(`${base}/lists/3/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 7,
        permission: 'VIEW'
      })
    });

    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0);
  });
});
