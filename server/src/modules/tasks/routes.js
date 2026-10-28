// TaskModule (owner: Aryan). Base path: /api/v1/tasks
// Every route requires a logged-in user. Ownership/permission checks (TM-SR-003) go in each handler
// or in a shared middleware: a user may only touch tasks they own or were granted access to (403 otherwise).
const express = require('express');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.post('/', notImplemented('TM-F-010'));              // create task
router.get('/', notImplemented('TM-F-015'));               // search, filter, sort: ?q=&status=&priority=&tag=&due=&sort= (TM-F-016)
router.patch('/:id', notImplemented('TM-F-011'));          // edit task (owner only)
router.delete('/:id', notImplemented('TM-F-012'));         // soft delete (set deleted_at)
router.post('/:id/complete', notImplemented('TM-F-013'));
router.post('/:id/reopen', notImplemented('TM-F-013'));

module.exports = router;
