
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sendDueDateReminders,
  REMINDER_WINDOW_HOURS,
  POLL_INTERVAL_MS,
} = require('../src/jobs/dueDateReminders');

const { makeDb } = require('./_taskTestHelpers');

test('TM-F-030: sends reminders for tasks approaching their due date', async () => {
  const expectedRows = [
    { id: 1, user_id: 42, task_id: 10 },
  ];

  const db = makeDb(() => ({ rows: expectedRows }));

  const result = await sendDueDateReminders(db);

  assert.deepEqual(result, expectedRows);
  assert.equal(db.calls.length, 1);
});

test('TM-F-030: checks the 24-hour reminder window', async () => {
  const db = makeDb(() => ({ rows: [] }));

  await sendDueDateReminders(db);

  const sql = db.calls[0].sql;

  assert.match(sql, /23 hours 59 minutes/);
  assert.match(sql, /24 hours/);
});

test('TM-F-030: excludes completed and deleted tasks', async () => {
  const db = makeDb(() => ({ rows: [] }));

  await sendDueDateReminders(db);

  const sql = db.calls[0].sql;

  assert.match(sql, /status <> 'COMPLETED'/);
  assert.match(sql, /deleted_at IS NULL/);
});

test('TM-F-030: prevents duplicate reminders', async () => {
  const db = makeDb(() => ({ rows: [] }));

  await sendDueDateReminders(db);

  const sql = db.calls[0].sql;

  assert.match(sql, /NOT EXISTS/);
  assert.match(sql, /n\.user_id = r\.user_id/);
  assert.match(sql, /n\.task_id = r\.task_id/);
  assert.match(sql, /DUE_REMINDER/);
});

test('TM-F-030: sends reminders to both task owner and assignee', async () => {
  const db = makeDb(() => ({ rows: [] }));

  await sendDueDateReminders(db);

  const sql = db.calls[0].sql;

  assert.match(sql, /owner_id AS user_id/);
  assert.match(sql, /assignee_id AS user_id/);
  assert.match(sql, /UNION/);
  assert.match(sql, /assignee_id IS NOT NULL/);
});

test('TM-F-030: uses the expected reminder configuration', () => {
  assert.equal(REMINDER_WINDOW_HOURS, 24);
  assert.equal(POLL_INTERVAL_MS, 30 * 1000);
});

test('TM-F-030: propagates database errors', async () => {
  const db = makeDb(() => {
    throw new Error('Database connection failed');
  });

  await assert.rejects(
    sendDueDateReminders(db),
    /Database connection failed/
  );
});
