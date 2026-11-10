const mongoose = require('mongoose');

const identityRequestSchema = new mongoose.Schema(
  {
    // unique => one identity request per message
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true, unique: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the receiver of the message
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false }, // the hidden author
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

identityRequestSchema.index({ sender: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('IdentityRequest', identityRequestSchema);
