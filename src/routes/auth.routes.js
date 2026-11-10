const router = require('express').Router();
const c = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiters');

router.post('/register', authLimiter, c.register);
router.post('/login', authLimiter, c.login);
router.post('/refresh', authLimiter, c.refresh);
router.post('/logout', protect, c.logout);

router.post('/2fa/verify', authLimiter, c.verify2FA);
router.post('/2fa/enable', protect, authLimiter, c.enable2FA);
router.post('/2fa/confirm', protect, authLimiter, c.confirm2FA);
router.post('/2fa/disable', protect, authLimiter, c.disable2FA);

router.post('/forgot-password', authLimiter, c.forgotPassword);
router.post('/reset-password', authLimiter, c.resetPassword);

module.exports = router;
