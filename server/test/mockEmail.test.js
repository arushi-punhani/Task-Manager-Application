const test = require('node:test');
const assert = require('node:assert/strict');
const mail = require('../src/modules/auth/mockEmail');

// The real app uses these as its default mailers. A missing export made POST /auth/password-reset/request
// return 500 for existing accounts, which mocked-mailer tests could not see.
test('mock mail service exports every mailer the app uses', () => {
  for (const name of ['sendVerificationEmail', 'sendPasswordResetEmail', 'sendTaskAssignmentEmail']) {
    assert.equal(typeof mail[name], 'function', `${name} must be exported`);
  }
});

test('password reset mock email prints the reset link and does not throw', async () => {
  const lines = [];
  const original = console.info;
  console.info = (...args) => lines.push(args.join(' '));
  try {
    await mail.sendPasswordResetEmail({ to: 'a@x.com', resetUrl: 'http://localhost/reset-password?token=abc' });
  } finally {
    console.info = original;
  }
  assert.match(lines[0], /a@x\.com/);
  assert.match(lines[0], /token=abc/);
});
