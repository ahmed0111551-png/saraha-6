// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=StrongPass123 npm run seed:admin
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');

(async () => {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  if (!email || password.length < 8) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars)');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = 'admin';
    await existing.save();
    console.log(`Existing user ${email} promoted to admin`);
  } else {
    await User.create({ name: 'Admin', username, email, password, role: 'admin' });
    console.log(`Admin ${email} created`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
