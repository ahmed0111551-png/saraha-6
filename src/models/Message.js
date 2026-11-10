const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    // `select: false` => the sender is NEVER returned unless a query explicitly asks for it.
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ receiver: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
