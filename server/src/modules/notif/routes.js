// NotifModule (owner: Arya). Base path: /api/v1/notifications
// Also holds the Reminder Scheduler (TM-F-030): a scheduled job that sends reminders before due dates.
// Email goes through a mock/sandbox service in this version.
const express = require('express');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', notImplemented('TM-F-031'));   // list the current user's in-app notifications

module.exports = router;
