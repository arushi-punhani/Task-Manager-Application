// AuthModule (owner: Arushi). Base path: /api/v1/auth
const express = require('express');
const notImplemented = require('../../middleware/notImplemented');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.post('/register', notImplemented('TM-F-001'));                 // create account, hash password (TM-SR-002)
router.post('/login', notImplemented('TM-F-002'));                    // returns { token, expiresIn }; 423 when locked (TM-F-003)
router.post('/logout', authenticate, notImplemented('TM-SR-004'));    // invalidate token
router.post('/password-reset/request', notImplemented('TM-F-004'));
router.post('/password-reset/confirm', notImplemented('TM-F-004'));

module.exports = router;
