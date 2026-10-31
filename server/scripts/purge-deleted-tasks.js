// Runs the 30-day purge once by hand: from the server folder, `npm run purge` (TM-NF-005).
require('dotenv').config();
const pool = require('../src/config/db');
const { purgeDeletedTasks, RETENTION_DAYS } = require('../src/jobs/purgeDeletedTasks');

purgeDeletedTasks(pool)
  .then((purged) => console.log(`Purged ${purged} task(s) deleted more than ${RETENTION_DAYS} days ago.`))
  .catch((error) => { console.error(`Purge failed: ${error.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
