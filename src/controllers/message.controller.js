const Message = require('../models/Message');
const User = require('../models/User');
const IdentityRequest = require('../models/IdentityRequest');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');

// 1) Send anonymous message. The sender is stored but never returned to the receiver.
exports.sendMessage = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const receiverId = v.objectId(b.receiverId, 'receiverId');
  const content = v.str(b.content, 'content', { max: 2000 });

  if (receiverId === req.user.id) throw new AppError('You cannot send a message to yourself', 400);
  const receiver = await User.findById(receiverId).select('isBanned');
  if (!receiver || receiver.isBanned) throw new AppError('Receiver not found', 404);

  const message = await Message.create({ sender: req.user._id, receiver: receiver._id, content });
  res.status(201).json({ id: message.id, receiverId, content: message.content, createdAt: message.createdAt });
});

// Inbox: no sender data at all.
exports.inbox = asyncHandler(async (req, res) => {
  const { page, limit, skip } = v.pagination(req.query);
  const filter = { receiver: req.user._id };

  const [messages, total] = await Promise.all([
    Message.find(filter).sort('-createdAt').skip(skip).limit(limit).lean(), // sender is select:false
    Message.countDocuments(filter),
  ]);

  const requests = await IdentityRequest.find({ message: { $in: messages.map((m) => m._id) } })
    .select('message status')
    .lean();
  const statusByMessage = new Map(requests.map((r) => [String(r.message), r.status]));

  res.json({
    data: messages.map((m) => ({
      id: m._id,
      content: m.content,
      createdAt: m.createdAt,
      identityRequestStatus: statusByMessage.get(String(m._id)) || null,
    })),
    page,
    limit,
    total,
  });
});

// One message. The sender is revealed ONLY if the identity request was accepted.
exports.getMessage = asyncHandler(async (req, res) => {
  const message = await Message.findOne({ _id: req.params.messageId, receiver: req.user._id })
    .select('+sender')
    .lean();
  if (!message) throw new AppError('Message not found', 404);

  const request = await IdentityRequest.findOne({ message: message._id }).select('status').lean();

  let sender = null;
  if (request && request.status === 'accepted') {
    const s = await User.findById(message.sender).select('name username').lean();
    if (s) sender = { id: s._id, name: s.name, username: s.username };
  }

  res.json({
    id: message._id,
    content: message.content,
    createdAt: message.createdAt,
    identityRequestStatus: request ? request.status : null,
    sender,
  });
});
