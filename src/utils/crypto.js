const crypto = require('crypto');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('hex');
const randomOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const safeEqual = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

module.exports = { sha256, randomToken, randomOtp, safeEqual };
