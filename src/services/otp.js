const User = require('../models/User');
const config = require('../config');
const AppError = require('../utils/AppError');
const { sha256, randomOtp, safeEqual } = require('../utils/crypto');
const { sendMail } = require('../utils/mailer');

async function sendOtp(user, purpose) {
  const code = randomOtp();
  await User.updateOne(
    { _id: user._id },
    {
      otpHash: sha256(code),
      otpExpires: new Date(Date.now() + config.otp.expiresMin * 60 * 1000),
      otpAttempts: 0,
      otpPurpose: purpose,
    }
  );
  await sendMail({
    to: user.email,
    subject: 'Your verification code',
    text: `Your verification code is ${code}. It expires in ${config.otp.expiresMin} minutes.`,
  });
}

// The attempt counter is incremented atomically BEFORE comparing, so parallel
// guesses cannot bypass the attempts limit.
async function checkOtp(userId, code, purpose) {
  const claimed = await User.updateOne(
    {
      _id: userId,
      otpPurpose: purpose,
      otpExpires: { $gt: new Date() },
      otpAttempts: { $lt: config.otp.maxAttempts },
    },
    { $inc: { otpAttempts: 1 } }
  );
  const invalid = () =>
    new AppError('Code is invalid, expired, or too many attempts. Please request a new code.', 400);
  if (claimed.matchedCount === 0) throw invalid();

  const user = await User.findById(userId).select('+otpHash');
  if (!user || !user.otpHash) throw invalid();
  if (!safeEqual(sha256(code), user.otpHash)) throw new AppError('Invalid verification code', 400);

  await User.updateOne(
    { _id: userId },
    { $unset: { otpHash: 1, otpExpires: 1, otpPurpose: 1, otpAttempts: 1 } }
  );
}

module.exports = { sendOtp, checkOtp };
