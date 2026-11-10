const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Link to the original anonymous message (one conversation per message)
    originalMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true, unique: true },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.methods.isParticipant = function (userId) {
  const id = String(userId);
  return String(this.sender) === id || String(this.receiver) === id;
};

module.exports = mongoose.model('Conversation', conversationSchema);
