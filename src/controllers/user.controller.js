const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');

exports.me = (req, res) => {
  const u = req.user;
  res.json({ id: u.id, name: u.name, username: u.username, email: u.email, role: u.role, twoFactorEnabled: u.twoFactorEnabled });
};

// Lets a sender find the receiverId of someone they want to message.
exports.getByUsername = asyncHandler(async (req, res) => {
  const username = v.username(req.params.username);
  const user = await User.findOne({ username, isBanned: false }).select('name username');
  if (!user) throw new AppError('User not found', 404);
  res.json({ id: user.id, name: user.name, username: user.username });
});
