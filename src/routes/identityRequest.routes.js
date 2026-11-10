const router = require('express').Router();
const c = require('../controllers/identityRequest.controller');
const { protect } = require('../middlewares/auth');
const v = require('../utils/validate');

router.param('requestId', (req, res, next, value) => {
  try {
    v.objectId(value, 'requestId');
    next();
  } catch (err) {
    next(err);
  }
});

router.use(protect);
router.get('/sent', c.listSent);
router.get('/received', c.listReceived);
router.patch('/:requestId/accept', c.acceptRequest);
router.patch('/:requestId/reject', c.rejectRequest);

module.exports = router;
