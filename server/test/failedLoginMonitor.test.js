'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFailedLoginMonitor } = require('../src/modules/auth/failedLoginMonitor');

function fakeDatabase() {
  const events = [];
  const audits = [];
  const warnings = [];
  const client = {
    async query(sql, params = []) {
      const q = sql.replace(/\s+/g, ' ').trim();
      if (q === 'BEGIN' || q === 'COMMIT' || q === 'ROLLBACK' || q.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
      if (q.startsWith('INSERT INTO auth_security_events')) {
        events.push({ eventType: q.includes("'BRUTE_FORCE_ALERT'") ? 'BRUTE_FORCE_ALERT' : 'FAILED_LOGIN', subjectType: params[0], subjectHash: params[1] });
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('SELECT COUNT(*)::int AS count')) {
        const count = events.filter((e) => e.eventType === 'FAILED_LOGIN' && e.subjectType === params[0] && e.subjectHash === params[1]).length;
        return { rows: [{ count }], rowCount: 1 };
      }
      if (q.startsWith('SELECT 1 FROM auth_security_events')) {
        const found = events.some((e) => e.eventType === 'BRUTE_FORCE_ALERT' && e.subjectType === params[0] && e.subjectHash === params[1]);
        return { rows: found ? [{ '?column?': 1 }] : [], rowCount: found ? 1 : 0 };
      }
      if (q.startsWith('INSERT INTO audit_log')) {
        audits.push({ action: q.includes('BRUTE_FORCE_ALERT') ? 'BRUTE_FORCE_ALERT' : 'LOGIN_FAILED', outcome: params[0] });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in test double: ${q}`);
    },
    release() {},
  };
  return { events, audits, warnings, db: { async connect() { return client; } } };
}

test('failed-login monitor alerts and writes an audit row at five attempts in a ten-minute window', async () => {
  const fake = fakeDatabase();
  const monitor = createFailedLoginMonitor({ db: fake.db, secret: 'unit-test-secret', logger: { warn: (line) => fake.warnings.push(JSON.parse(line)) } });
  for (let i = 0; i < 4; i += 1) {
    const result = await monitor.recordFailedLogin({ email: 'victim@example.test', userId: 12, ipAddress: '127.0.0.1' });
    assert.equal(result.alertsCreated, 0);
  }
  const fifth = await monitor.recordFailedLogin({ email: 'victim@example.test', userId: 12, ipAddress: '127.0.0.1' });
  assert.equal(fifth.alertsCreated, 1);
  assert.equal(fake.audits.filter((a) => a.action === 'BRUTE_FORCE_ALERT').length, 1);
  assert.equal(fake.warnings.length, 1);
  assert.equal(fake.warnings[0].event, 'SECURITY_ALERT');
  assert.equal(fake.warnings[0].failedAttemptsInWindow, 5);
});

test('monitor de-duplicates further alerts for the same subject during the ten-minute window', async () => {
  const fake = fakeDatabase();
  const monitor = createFailedLoginMonitor({ db: fake.db, secret: 'unit-test-secret', logger: { warn: (line) => fake.warnings.push(JSON.parse(line)) } });
  for (let i = 0; i < 8; i += 1) await monitor.recordFailedLogin({ email: 'same@example.test', userId: 8, ipAddress: '192.0.2.8' });
  assert.equal(fake.audits.filter((a) => a.action === 'BRUTE_FORCE_ALERT').length, 1);
  assert.equal(fake.warnings.length, 1);
});

test('monitor persists only HMAC hashes, not the raw email address', async () => {
  const fake = fakeDatabase();
  const monitor = createFailedLoginMonitor({ db: fake.db, secret: 'unit-test-secret', logger: { warn: () => {} } });
  await monitor.recordFailedLogin({ email: 'private.person@example.test', ipAddress: '192.0.2.9' });
  assert.equal(fake.events.some((e) => e.subjectHash === 'private.person@example.test'), false);
  assert.ok(fake.events.every((e) => /^[a-f0-9]{64}$/.test(e.subjectHash)));
});

test('monitor detects a distributed login attack across different accounts from one IP', async () => {
  const fake = fakeDatabase();
  const monitor = createFailedLoginMonitor({ db: fake.db, secret: 'unit-test-secret', logger: { warn: (line) => fake.warnings.push(JSON.parse(line)) } });
  for (let i = 0; i < 5; i += 1) {
    await monitor.recordFailedLogin({ email: `account-${i}@example.test`, userId: i + 1, ipAddress: '198.51.100.44' });
  }
  assert.equal(fake.audits.filter((a) => a.action === 'BRUTE_FORCE_ALERT').length, 1);
  assert.equal(fake.warnings.length, 1);
  assert.equal(fake.warnings[0].subjectType, 'IP');
  assert.equal(fake.warnings[0].failedAttemptsInWindow, 5);
});
