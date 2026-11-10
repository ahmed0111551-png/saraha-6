const router = require('express').Router();
const c = require('../controllers/conversation.controller');
const { protect } = require('../middlewares/auth');
const { messageLimiter } = require('../middlewares/rateLimiters');
const v = require('../utils/validate');

router.param('conversationId', (req, res, next, value) => {
  try {
    v.objectId(value, 'conversationId');
    next();
  } catch (err) {
    next(err);
  }
});

router.use(protect);
router.get('/', c.listConversations);
router.post('/:conversationId/messages', messageLimiter, c.sendMessage);
router.get('/:conversationId/messages', c.getMessages);

module.exports = router;
