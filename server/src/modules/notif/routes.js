
const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');

function createNotificationsRouter({
  db = pool,
  authMiddleware = authenticate
} = {}) {
  const router = express.Router();

  router.use(authMiddleware);

  // GET /api/v1/notifications
  // Returns only the logged-in user's in-app notifications.
  router.get('/', async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, type, task_id, channel, sent_at, read_at
         FROM notifications
         WHERE user_id = $1
           AND channel = 'IN_APP'
         ORDER BY sent_at DESC NULLS LAST, id DESC
         LIMIT 100`,
        [req.user.id]
      );

      return res.json({
        notifications: result.rows
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

const router = createNotificationsRouter();
router.createNotificationsRouter = createNotificationsRouter;

module.exports = router;
