const bcrypt = require('bcryptjs');
const config = require('../config');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');
const { sha256, randomToken, safeEqual } = require('../utils/crypto');
const { signAccess, signRefresh, signTemp, verifyToken } = require('../utils/tokens');
const { sendMail } = require('../utils/mailer');
const { sendOtp, checkOtp } = require('../services/otp');

// Used so that "unknown email" takes about as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  username: u.username,
  email: u.email,
  role: u.role,
  twoFactorEnabled: u.twoFactorEnabled,
});

async function issueSession(user) {
  const accessToken = signAccess(user.id);
  const refreshToken = signRefresh(user.id);
  await User.updateOne({ _id: user._id }, { refreshTokenHash: sha256(refreshToken) });
  return { accessToken, refreshToken };
}

exports.register = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const name = v.str(b.name, 'name', { min: 2, max: 50 });
  const username = v.username(b.username);
  const email = v.email(b.email);
  const password = v.password(b.password);

  const taken = await User.findOne({ $or: [{ email }, { username }] }).select('email').lean();
  if (taken) throw new AppError(taken.email === email ? 'Email already in use' : 'Username already taken', 409);

  const user = await User.create({ name, username, email, password });
  res.status(201).json({ user: publicUser(user), ...(await issueSession(user)) });
});

exports.login = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const email = v.email(b.email);
  const password = v.str(b.password, 'password', { max: 72, trim: false });

  const user = await User.findOne({ email }).select('+password');
  const ok = user ? await user.checkPassword(password) : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
  if (!ok) throw new AppError('Invalid email or password', 401);
  if (user.isBanned) throw new AppError('Your account has been banned', 403);

  if (user.twoFactorEnabled) {
    await sendOtp(user, 'login');
    return res.json({
      requires2FA: true,
      tempToken: signTemp(user.id),
      message: 'A verification code was sent to your email',
    });
  }
  res.json({ user: publicUser(user), ...(await issueSession(user)) });
});

// ---- 2-step verification ----

exports.verify2FA = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const tempToken = v.str(b.tempToken, 'tempToken', { max: 2000 });
  const code = v.str(b.code, 'code', { min: 6, max: 6 });

  const payload = verifyToken(tempToken, config.jwt.secret, '2fa');
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError('Invalid token', 401);
  if (user.isBanned) throw new AppError('Your account has been banned', 403);

  await checkOtp(user._id, code, 'login');
  res.json({ user: publicUser(user), ...(await issueSession(user)) });
});

exports.enable2FA = asyncHandler(async (req, res) => {
  if (req.user.twoFactorEnabled) throw new AppError('2-step verification is already enabled', 409);
  await sendOtp(req.user, 'enable');
  res.json({ message: 'A verification code was sent to your email' });
});

exports.confirm2FA = asyncHandler(async (req, res) => {
  const code = v.str((req.body || {}).code, 'code', { min: 6, max: 6 });
  await checkOtp(req.user._id, code, 'enable');
  await User.updateOne({ _id: req.user._id }, { twoFactorEnabled: true });
  res.json({ message: '2-step verification enabled' });
});

exports.disable2FA = asyncHandler(async (req, res) => {
  const password = v.str((req.body || {}).password, 'password', { max: 72, trim: false });
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.checkPassword(password))) throw new AppError('Incorrect password', 401);
  await User.updateOne({ _id: user._id }, { twoFactorEnabled: false });
  res.json({ message: '2-step verification disabled' });
});

// ---- tokens ----

exports.refresh = asyncHandler(async (req, res) => {
  const token = v.str((req.body || {}).refreshToken, 'refreshToken', { max: 2000 });
  const payload = verifyToken(token, config.jwt.refreshSecret, 'refresh');

  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user) throw new AppError('Invalid token', 401);
  if (!user.refreshTokenHash || !safeEqual(sha256(token), user.refreshTokenHash)) {
    // Old/stolen token reused => kill the session completely.
    await User.updateOne({ _id: user._id }, { $unset: { refreshTokenHash: 1 } });
    throw new AppError('Invalid token', 401);
  }
  if (user.isBanned) throw new AppError('Your account has been banned', 403);

  res.json(await issueSession(user)); // rotation
});

exports.logout = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $unset: { refreshTokenHash: 1 } });
  res.json({ message: 'Logged out' });
});

// ---- forgot / reset password ----

exports.forgotPassword = asyncHandler(async (req, res) => {
  const email = v.email((req.body || {}).email);
  const user = await User.findOne({ email });

  if (user && !user.isBanned) {
    const token = randomToken();
    await User.updateOne(
      { _id: user._id },
      {
        passwordResetHash: sha256(token),
        passwordResetExpires: new Date(Date.now() + config.resetExpiresMin * 60 * 1000),
      }
    );
    sendMail({
      to: user.email,
      subject: 'Reset your password',
      text: `Reset your password using this link (valid for ${config.resetExpiresMin} minutes):\n${config.clientUrl}/reset-password?token=${token}`,
    }).catch((err) => console.error('Failed to send reset email', err));
  }
  // Same response whether the email exists or not (no user enumeration).
  res.json({ message: 'If that email exists, a reset link has been sent' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const token = v.str(b.token, 'token', { max: 200 });
  const newPassword = v.password(b.newPassword, 'newPassword');

  const user = await User.findOne({
    passwordResetHash: sha256(token),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) throw new AppError('Reset token is invalid or expired', 400);

  user.password = newPassword;
  user.passwordResetHash = undefined; // single use
  user.passwordResetExpires = undefined;
  user.refreshTokenHash = undefined; // log out everywhere
  await user.save();

  res.json({ message: 'Password updated, you can now log in' });
});
