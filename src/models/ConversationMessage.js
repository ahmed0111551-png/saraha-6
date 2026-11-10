const mongoose = require('mongoose');

const conversationMessageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

conversationMessageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model('ConversationMessage', conversationMessageSchema);
