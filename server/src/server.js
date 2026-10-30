require('dotenv').config();
const app = require('./app');

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}/api/v1`);
  // TM-NF-005: purge tasks deleted more than 30 days ago, daily. Set PURGE_DISABLED=true to turn it off.
  if (process.env.PURGE_DISABLED !== 'true') require('./jobs/purgeDeletedTasks').startPurgeSchedule();
});
