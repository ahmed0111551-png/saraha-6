const router = require('express').Router();
const messages = require('../controllers/message.controller');
const requests = require('../controllers/identityRequest.controller');
const { protect } = require('../middlewares/auth');
const { messageLimiter } = require('../middlewares/rateLimiters');
const v = require('../utils/validate');

router.param('messageId', (req, res, next, value) => {
  try {
    v.objectId(value, 'messageId');
    next();
  } catch (err) {
    next(err);
  }
});

router.use(protect);
router.post('/', messageLimiter, messages.sendMessage);
router.get('/inbox', messages.inbox); // must stay above '/:messageId'
router.get('/:messageId', messages.getMessage);
router.post('/:messageId/identity-requests', requests.createRequest);

module.exports = router;
