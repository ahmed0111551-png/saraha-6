require('dotenv').config();

const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: '15m',
    refreshExpires: '7d',
    tempExpires: '10m', // short-lived token issued between password step and 2FA step
  },
  otp: { expiresMin: 5, maxAttempts: 5 },
  resetExpiresMin: 15,
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'Anonymous Messaging <no-reply@example.com>',
  },
};
