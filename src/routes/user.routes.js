const router = require('express').Router();
const c = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth');

router.use(protect);
router.get('/me', c.me);
router.get('/by-username/:username', c.getByUsername);

module.exports = router;
