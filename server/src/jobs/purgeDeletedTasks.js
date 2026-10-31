// TM-NF-005: deleted tasks stay recoverable for 30 days, then this job removes them for good.
// A task is soft-deleted by setting tasks.deleted_at (TM-F-012). Comments, tags and notifications of a purged
// task go with it (ON DELETE CASCADE in db/schema.sql), and every purged task is written to the audit log.
const pool = require('../config/db');

const RETENTION_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Removes tasks deleted more than `days` days ago. Returns how many tasks were purged.
async function purgeDeletedTasks(db = pool, days = RETENTION_DAYS) {
  const result = await db.query(
    `WITH purged AS (
       DELETE FROM tasks
       WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - make_interval(days => $1)
       RETURNING id
     ), logged AS (
       INSERT INTO audit_log (actor_id, action, target_id)
       SELECT NULL::integer, 'TASK_PURGED', id FROM purged
     )
     SELECT COUNT(*)::int AS purged FROM purged`,
    [days],
  );
  return result.rows[0].purged;
}

// Runs the purge now and then once a day while the server is up. The timer never keeps the process alive.
function startPurgeSchedule({ db = pool, intervalMs = ONE_DAY_MS, log = console } = {}) {
  const run = async () => {
    try {
      const purged = await purgeDeletedTasks(db);
      if (purged > 0) log.log(`Purge job: removed ${purged} task(s) deleted more than ${RETENTION_DAYS} days ago`);
    } catch (error) {
      log.error(`Purge job failed: ${error.message}`);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { purgeDeletedTasks, startPurgeSchedule, RETENTION_DAYS };
