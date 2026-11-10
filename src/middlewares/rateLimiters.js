const rateLimit = require('express-rate-limit');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message },
  });

// login / register / 2FA / forgot / reset (limits can be raised via env, e.g. for tests)
exports.authLimiter = make(15 * 60 * 1000, Number(process.env.AUTH_RATE_LIMIT) || 20, 'Too many attempts, please try again later');
// sending anonymous messages
exports.messageLimiter = make(60 * 1000, Number(process.env.MESSAGE_RATE_LIMIT) || 15, 'You are sending messages too fast');
