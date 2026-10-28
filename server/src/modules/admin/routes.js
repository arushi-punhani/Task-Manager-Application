// AdminModule (owner: Arnav). Base path: /api/v1/admin. ADMIN role only.
// Every admin action must write an audit_log entry (TM-F-051).
const express = require('express');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/users', notImplemented('TM-F-050'));
router.patch('/users/:id/status', notImplemented('TM-F-050'));  // disable / enable
router.delete('/users/:id', notImplemented('TM-F-050'));
router.get('/audit-logs', notImplemented('TM-F-051'));

module.exports = router;
