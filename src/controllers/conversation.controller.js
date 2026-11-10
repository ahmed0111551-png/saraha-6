const Conversation = require('../models/Conversation');
const ConversationMessage = require('../models/ConversationMessage');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');

// Authorization: only the two users involved may touch a conversation.
async function loadConversation(req) {
  const conversation = await Conversation.findById(req.params.conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  if (!conversation.isParticipant(req.user._id)) throw new AppError('You are not part of this conversation', 403);
  return conversation;
}

exports.listConversations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = v.pagination(req.query);
  const filter = { $or: [{ sender: req.user._id }, { receiver: req.user._id }] };

  const [items, total] = await Promise.all([
    Conversation.find(filter)
      .sort('-lastMessageAt')
      .skip(skip)
      .limit(limit)
      .populate('sender receiver', 'name username')
      .lean(),
    Conversation.countDocuments(filter),
  ]);

  res.json({
    data: items.map((c) => {
      const other = String(c.sender._id) === req.user.id ? c.receiver : c.sender;
      return {
        id: c._id,
        originalMessageId: c.originalMessage,
        with: { id: other._id, name: other.name, username: other.username },
        lastMessageAt: c.lastMessageAt,
      };
    }),
    page,
    limit,
    total,
  });
});

exports.sendMessage = asyncHandler(async (req, res) => {
  const content = v.str((req.body || {}).content, 'content', { max: 2000 });
  const conversation = await loadConversation(req);

  const otherId = String(conversation.sender) === req.user.id ? conversation.receiver : conversation.sender;
  const other = await User.findById(otherId).select('isBanned');
  if (!other || other.isBanned) throw new AppError('You cannot send messages in this conversation', 403);

  const message = await ConversationMessage.create({
    conversation: conversation._id,
    author: req.user._id,
    content,
  });
  await Conversation.updateOne({ _id: conversation._id }, { lastMessageAt: message.createdAt });

  res.status(201).json({ id: message.id, authorId: req.user.id, content: message.content, createdAt: message.createdAt });
});

// Newest first, paginated.
exports.getMessages = asyncHandler(async (req, res) => {
  const { page, limit, skip } = v.pagination(req.query);
  const conversation = await loadConversation(req);

  const filter = { conversation: conversation._id };
  const [items, total] = await Promise.all([
    ConversationMessage.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(),
    ConversationMessage.countDocuments(filter),
  ]);

  res.json({
    data: items.map((m) => ({ id: m._id, authorId: m.author, content: m.content, createdAt: m.createdAt })),
    page,
    limit,
    total,
  });
});
