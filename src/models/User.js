const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Ban
    isBanned: { type: Boolean, default: false, index: true },
    banReason: { type: String, default: null },
    bannedAt: { type: Date, default: null },

    // 2-step verification (email OTP)
    twoFactorEnabled: { type: Boolean, default: false },
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, select: false },
    otpPurpose: { type: String, enum: ['login', 'enable'], select: false },

    // Forgot / reset password (only the hash of the token is stored)
    passwordResetHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Hash of the current refresh token (one active session per user)
    refreshTokenHash: { type: String, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.password); // requires .select('+password')
};

module.exports = mongoose.model('User', userSchema);
