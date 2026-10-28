// CollabModule (owner: Arya). Mounted at /api/v1 because its paths hang off /tasks and /lists.
const express = require('express');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/tasks/:id/assign', notImplemented('TM-F-020'));     // also raises TaskAssigned for NotifModule (TM-F-031)
router.post('/tasks/:id/comments', notImplemented('TM-F-021'));
router.post('/lists/:id/shares', notImplemented('TM-F-022'));     // VIEW or EDIT permission

module.exports = router;
