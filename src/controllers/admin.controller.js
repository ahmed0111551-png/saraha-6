const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');

const adminView = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  role: u.role,
  isBanned: u.isBanned,
  banReason: u.banReason,
  bannedAt: u.bannedAt,
  createdAt: u.createdAt,
});

exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = v.pagination(req.query);
  const filter = {};
  if (req.query.banned === 'true') filter.isBanned = true;
  if (req.query.banned === 'false') filter.isBanned = false;
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const rx = new RegExp(v.escapeRegex(req.query.q.trim().slice(0, 50)), 'i');
    filter.$or = [{ email: rx }, { username: rx }, { name: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ data: users.map(adminView), page, limit, total });
});

exports.banUser = asyncHandler(async (req, res) => {
  const reason = req.body && req.body.reason !== undefined ? v.str(req.body.reason, 'reason', { max: 200 }) : null;

  if (req.params.userId === req.user.id) throw new AppError('You cannot ban yourself', 400);
  const target = await User.findById(req.params.userId);
  if (!target) throw new AppError('User not found', 404);
  if (target.role === 'admin') throw new AppError('You cannot ban an admin', 403);
  if (target.isBanned) throw new AppError('User is already banned', 409);

  target.isBanned = true;
  target.banReason = reason;
  target.bannedAt = new Date();
  target.refreshTokenHash = undefined; // kill the session
  await target.save();
  res.json({ message: 'User banned', user: adminView(target) });
});

exports.unbanUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.userId);
  if (!target) throw new AppError('User not found', 404);
  if (!target.isBanned) throw new AppError('User is not banned', 409);

  target.isBanned = false;
  target.banReason = null;
  target.bannedAt = null;
  await target.save();
  res.json({ message: 'User unbanned', user: adminView(target) });
});
