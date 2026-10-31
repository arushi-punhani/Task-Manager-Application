const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const { createAuthRouter } = require('../src/modules/auth/routes');
const errorHandler = require('../src/middleware/errorHandler');

const VALID_EMAIL = 'arnav.auth49@example.test';
const VALID_PASSWORD = 'Passw0rd'; // Exactly 8 characters: SRS minimum.
const SECRET = 'auth-issue-49-test-secret-with-sufficient-entropy';

function withServer(app, fn) {
  return async () => {
    const server = app.listen(0, '127.0.0.1');
    try {
      await new Promise((resolve, reject) => {
        if (server.listening) return resolve();
        server.once('listening', resolve);
        server.once('error', reject);
      });
      const address = server.address();
      await fn(`http://127.0.0.1:${address.port}`);
    } finally {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
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

async function postJson(base, path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('TC-Auth-01: accepts the 8-character password minimum and rejects invalid email / 7-character password', withServer(authApp({
  db: {
    async query(sql, params) {
      if (sql.includes('INSERT INTO users')) {
        assert.equal(params[0], VALID_EMAIL);
        assert.equal(await bcrypt.compare(VALID_PASSWORD, params[1]), true);
        assert.notEqual(params[1], VALID_PASSWORD);
        return { rows: [{ id: 4901, email: params[0], email_verified: false }] };
      }
      assert.match(sql, /INSERT INTO email_verification_tokens/);
      assert.equal(params[0], 4901);
      assert.match(params[1], /^[a-f0-9]{64}$/);
      return { rows: [] };
    },
  },
  mailer: async ({ to, verificationUrl }) => {
    assert.equal(to, VALID_EMAIL);
    assert.match(verificationUrl, /\/api\/v1\/auth\/verify-email\?token=[a-f0-9]{64}$/);
  },
}), async (base) => {
  const badEmail = await postJson(base, '/api/v1/auth/register', {
    email: 'not-an-email',
    password: VALID_PASSWORD,
  });
  assert.equal(badEmail.status, 400);

  const shortPassword = await postJson(base, '/api/v1/auth/register', {
    email: VALID_EMAIL,
    password: 'Pass123', // 7 characters.
  });
  assert.equal(shortPassword.status, 400);

  const valid = await postJson(base, '/api/v1/auth/register', {
    email: ` ${VALID_EMAIL.toUpperCase()} `,
    password: VALID_PASSWORD,
  });
  assert.equal(valid.status, 201);
  assert.deepEqual((await valid.json()).user, {
    id: 4901,
    email: VALID_EMAIL,
    emailVerified: false,
  });
}));

test('TC-Auth-01: duplicate registration is rejected without sending another verification email', withServer(authApp({
  db: {
    async query(sql) {
      assert.match(sql, /INSERT INTO users/);
      const error = new Error('duplicate email');
      error.code = '23505';
      throw error;
    },
  },
  mailer: async () => {
    assert.fail('Mailer must not run when the account insert fails');
  },
}), async (base) => {
  const response = await postJson(base, '/api/v1/auth/register', {
    email: VALID_EMAIL,
    password: VALID_PASSWORD,
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'An account with this email already exists',
  });
}));

test('TC-Auth-02: wrong password and unknown email are both rejected with the same generic response', withServer(authApp({
  db: {
    async query(sql, params) {
      if (sql.startsWith('SELECT id, email')) {
        assert.equal(params.length, 1);
        if (params[0] === 'known@example.test') {
          return {
            rows: [{
              id: 4902,
              email: params[0],
              password_hash: await bcrypt.hash('CorrectPass8', 4),
              role: 'USER',
              status: 'ACTIVE',
            }],
          };
        }
        return { rows: [] };
      }
      assert.fail(`Unexpected database query during rejected login: ${sql}`);
    },
  },
  jwtSecret: () => SECRET,
  jwtExpiresIn: () => '1h',
}), async (base) => {
  const wrongPassword = await postJson(base, '/api/v1/auth/login', {
    email: 'known@example.test',
    password: 'WrongPass8',
  });
  const wrongPasswordBody = await wrongPassword.json();
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPasswordBody, { error: 'Invalid email or password' });

  const unknownEmail = await postJson(base, '/api/v1/auth/login', {
    email: 'missing@example.test',
    password: 'WrongPass8',
  });
  const unknownEmailBody = await unknownEmail.json();
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(unknownEmailBody, wrongPasswordBody);
}));

test('TC-Auth-02: login rejects missing credentials before querying the database', withServer(authApp({
  db: {
    async query() {
      assert.fail('Database must not be queried for missing credentials');
    },
  },
}), async (base) => {
  const missingEmail = await postJson(base, '/api/v1/auth/login', {
    password: VALID_PASSWORD,
  });
  assert.equal(missingEmail.status, 400);

  const missingPassword = await postJson(base, '/api/v1/auth/login', {
    email: VALID_EMAIL,
  });
  assert.equal(missingPassword.status, 400);
}));

test('TC-Auth-02: a disabled account cannot obtain a session even with the correct password', withServer(authApp({
  db: {
    async query(sql) {
      if (sql.startsWith('SELECT id, email')) {
        return {
          rows: [{
            id: 4903,
            email: VALID_EMAIL,
            password_hash: await bcrypt.hash(VALID_PASSWORD, 4),
            role: 'USER',
            status: 'DISABLED',
          }],
        };
      }
      assert.fail(`No session should be created for a disabled account: ${sql}`);
    },
  },
  jwtSecret: () => SECRET,
}), async (base) => {
  const response = await postJson(base, '/api/v1/auth/login', {
    email: VALID_EMAIL,
    password: VALID_PASSWORD,
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Account is disabled' });
}));
