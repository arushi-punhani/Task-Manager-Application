const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');

function withServer(fn) {
  return async () => {
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${server.address().port}/api/v1`);
    } finally {
      server.close();
    }
  };
}

test('health endpoint returns ok', withServer(async (base) => {
  const res = await fetch(`${base}/health`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { status: 'ok' });
}));

test('task endpoints reject requests without a token', withServer(async (base) => {
  const res = await fetch(`${base}/tasks`);
  assert.strictEqual(res.status, 401);
}));

test('admin endpoints reject requests without a token', withServer(async (base) => {
  const res = await fetch(`${base}/admin/users`);
  assert.strictEqual(res.status, 401);
}));
