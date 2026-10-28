// ReportModule (owner: Arnav). Mounted at /api/v1.
// Mounted BEFORE the tasks router in app.js so /tasks/export is not captured by /tasks/:id.
const express = require('express');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard/summary', notImplemented('TM-F-040'));   // counts by status: pending, in progress, completed, overdue
router.get('/tasks/export', notImplemented('TM-F-041'));        // ?format=csv|pdf

module.exports = router;
