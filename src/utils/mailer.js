const nodemailer = require('nodemailer');
const config = require('../config');

const transporter = config.smtp.host
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

if (!transporter && config.env === 'production') {
  throw new Error('SMTP_HOST must be configured in production');
}

async function sendMail({ to, subject, text }) {
  if (!transporter) {
    // Development fallback: print the email so you can copy the OTP / reset link.
    console.log(`\n[DEV MAIL] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, text });
}

module.exports = { sendMail };
