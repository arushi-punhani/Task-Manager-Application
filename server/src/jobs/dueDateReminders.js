
// TM-F-030: Due-date reminder scheduler
// Sends an in-app reminder 24 hours before a task deadline.

const pool = require('../config/db');

const REMINDER_WINDOW_HOURS = 24;
const POLL_INTERVAL_MS = 30 * 1000;

async function sendDueDateReminders(db = pool) {
  const result = await db.query(
    `
    WITH due_tasks AS (
      SELECT id, owner_id, assignee_id
      FROM tasks
      WHERE due_date IS NOT NULL
        AND due_date > NOW() + INTERVAL '23 hours 59 minutes'
        AND due_date <= NOW() + INTERVAL '24 hours'
        AND status <> 'COMPLETED'
        AND deleted_at IS NULL
    ),
    recipients AS (
      SELECT id AS task_id, owner_id AS user_id
      FROM due_tasks

      UNION

      SELECT id AS task_id, assignee_id AS user_id
      FROM due_tasks
      WHERE assignee_id IS NOT NULL
    )
    INSERT INTO notifications
      (user_id, type, task_id, channel, sent_at)
    SELECT
      r.user_id,
      'DUE_REMINDER',
      r.task_id,
      'IN_APP',
      NOW()
    FROM recipients r
    WHERE NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = r.user_id
        AND n.task_id = r.task_id
        AND n.type = 'DUE_REMINDER'
        AND n.channel = 'IN_APP'
    )
    RETURNING id, user_id, task_id
    `
  );

  return result.rows;
}

function startDueDateReminderSchedule({
  db = pool,
  intervalMs = POLL_INTERVAL_MS,
  log = console,
} = {}) {
  let running = false;

  const run = async () => {
    if (running) return;

    running = true;

    try {
      const reminders = await sendDueDateReminders(db);

      if (reminders.length > 0) {
        log.log(`TM-F-030: Sent ${reminders.length} due-date reminder(s).`);
      }
    } catch (error) {
      log.error('Due-date reminder job failed:', error.message);
    } finally {
      running = false;
    }
  };

  // Run immediately when the server starts.
  run();

  // Check every 30 seconds.
  const timer = setInterval(run, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return timer;
}

module.exports = {
  sendDueDateReminders,
  startDueDateReminderSchedule,
  REMINDER_WINDOW_HOURS,
  POLL_INTERVAL_MS,
};
