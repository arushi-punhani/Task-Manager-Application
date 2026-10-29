const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuthRouter } = require('../src/modules/auth/routes');
const { createAuthenticate } = require('../src/middleware/auth');
const errorHandler = require('../src/middleware/errorHandler');

const SECRET = 'test-secret-with-enough-entropy';

function withServer(app, fn) {
  return async () => {
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

function authApp(options) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', createAuthRouter(options));
  app.use(errorHandler);
  return app;
}

test('registration validates input, hashes passwords, and sends a mock verification email', withServer(authApp({
  db: {
    async query(sql, params) {
      if (sql.includes('INSERT INTO users')) {
        assert.equal(params[0], 'arushi@example.com');
        assert.notEqual(params[1], 'correct-horse');
        assert.equal(await bcrypt.compare('correct-horse', params[1]), true);
        return { rows: [{ id: 7, email: params[0], email_verified: false }] };
      }
      assert.match(sql, /INSERT INTO email_verification_tokens/);
      assert.equal(params[0], 7);
      assert.match(params[1], /^[a-f0-9]{64}$/);
      return { rows: [] };
    },
  },
  mailer: async ({ to, verificationUrl }) => {
    assert.equal(to, 'arushi@example.com');
    assert.match(verificationUrl, /\/api\/v1\/auth\/verify-email\?token=[a-f0-9]{64}$/);
  },
}), async (base) => {
  const invalid = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bad', password: 'short' }),
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ' Arushi@Example.com ', password: 'correct-horse' }),
  });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).user, { id: 7, email: 'arushi@example.com', emailVerified: false });
}));

test('verification link is single-use and marks its account verified', withServer(authApp({
  db: {
    async query(sql, params) {
      assert.match(sql, /UPDATE email_verification_tokens[\s\S]*UPDATE users/);
      assert.match(params[0], /^[a-f0-9]{64}$/);
      return { rows: [{ id: 7, email: 'arushi@example.com' }] };
    },
  },
}), async (base) => {
  const response = await fetch(`${base}/api/v1/auth/verify-email?token=${'a'.repeat(64)}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'Email verified' });
}));

test('login issues a signed JWT and persists its session', withServer(authApp({
  db: {
    async query(sql, params) {
      if (sql.startsWith('SELECT id, email')) {
        assert.deepEqual(params, ['arushi@example.com']);
        return { rows: [{ id: 7, email: params[0], password_hash: await bcrypt.hash('correct-horse', 4), role: 'USER', status: 'ACTIVE' }] };
      }
      assert.match(sql, /INSERT INTO auth_sessions/);
      const [tokenId, userId, expiresAt] = params;
      assert.equal(userId, 7);
      assert.ok(expiresAt instanceof Date);
      return { rows: [{ tokenId }] };
    },
  },
  jwtSecret: () => SECRET,
  jwtExpiresIn: () => '1h',
}), async (base) => {
  const response = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ARUSHI@example.com', password: 'correct-horse' }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  const claims = jwt.verify(data.token, SECRET);
  assert.equal(claims.sub, '7');
  assert.equal(claims.role, 'USER');
  assert.ok(claims.jti);
  assert.equal(data.expiresIn, '1h');
}));

test('logout revokes the authenticated session', withServer(authApp({
  db: {
    async query(sql, params) {
      assert.match(sql, /UPDATE auth_sessions SET revoked_at/);
      assert.deepEqual(params, ['session-id', 7]);
      return { rows: [] };
    },
  },
  authMiddleware(req, res, next) {
    req.user = { id: 7, role: 'USER' };
    req.authTokenId = 'session-id';
    next();
  },
}), async (base) => {
  const response = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: 'Logged out' });
}));

test('authentication rejects a valid JWT whose server-side session is revoked', withServer((() => {
  const app = express();
  app.get('/protected', createAuthenticate({
    db: { async query() { return { rows: [] }; } },
    jwtSecret: () => SECRET,
  }), (req, res) => res.json({ id: req.user.id }));
  app.use(errorHandler);
  return app;
})(), async (base) => {
  const token = jwt.sign({ role: 'USER' }, SECRET, { subject: '7', jwtid: 'revoked-id', expiresIn: '1h' });
  const response = await fetch(`${base}/protected`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Invalid or expired token' });
}));