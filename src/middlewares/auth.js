const config = require('../config');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/tokens');

// Requires a valid access token. Banned users are rejected on EVERY request.
exports.protect = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError('Authentication required', 401);

  const payload = verifyToken(token, config.jwt.secret, 'access');
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError('Authentication required', 401);
  if (user.isBanned) throw new AppError('Your account has been banned', 403);

  req.user = user;
  next();
});

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw new AppError('You do not have permission to do this', 403);
  next();
};
