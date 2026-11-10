const router = require('express').Router();
const c = require('../controllers/admin.controller');
const { protect, restrictTo } = require('../middlewares/auth');
const v = require('../utils/validate');

router.param('userId', (req, res, next, value) => {
  try {
    v.objectId(value, 'userId');
    next();
  } catch (err) {
    next(err);
  }
});

router.use(protect, restrictTo('admin'));
router.get('/users', c.listUsers);
router.post('/users/:userId/ban', c.banUser);
router.post('/users/:userId/unban', c.unbanUser);

module.exports = router;
