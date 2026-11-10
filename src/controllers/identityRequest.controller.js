const Message = require('../models/Message');
const User = require('../models/User');
const IdentityRequest = require('../models/IdentityRequest');
const Conversation = require('../models/Conversation');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const v = require('../utils/validate');

const STATUSES = ['pending', 'accepted', 'rejected'];

const statusFilter = (query) => {
  if (query.status === undefined) return {};
  if (!STATUSES.includes(query.status)) throw new AppError(`status must be one of: ${STATUSES.join(', ')}`, 400);
  return { status: query.status };
};

// 2) Request sender identity (receiver of the message). Creates a `pending` request.
exports.createRequest = asyncHandler(async (req, res) => {
  const message = await Message.findOne({ _id: req.params.messageId, receiver: req.user._id }).select('+sender');
  if (!message) throw new AppError('Message not found', 404);

  let request;
  try {
    request = await IdentityRequest.create({
      message: message._id,
      requester: req.user._id,
      sender: message.sender,
    });
  } catch (err) {
    if (err.code === 11000) throw new AppError('An identity request already exists for this message', 409);
    throw err;
  }
  res.status(201).json({ id: request.id, messageId: message.id, status: request.status, createdAt: request.createdAt });
});

// Requests I made as a receiver. The sender is revealed only on accepted requests.
exports.listSent = asyncHandler(async (req, res) => {
  const { page, limit, skip } = v.pagination(req.query);
  const filter = { requester: req.user._id, ...statusFilter(req.query) };

  const [items, total] = await Promise.all([
    IdentityRequest.find(filter).select('+sender').sort('-createdAt').skip(skip).limit(limit).lean(),
    IdentityRequest.countDocuments(filter),
  ]);

  const acceptedSenderIds = items.filter((i) => i.status === 'accepted').map((i) => i.sender);
  const users = await User.find({ _id: { $in: acceptedSenderIds } }).select('name username').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  res.json({
    data: items.map((i) => {
      const s = i.status === 'accepted' ? byId.get(String(i.sender)) : null;
      return {
        id: i._id,
        messageId: i.message,
        status: i.status,
        createdAt: i.createdAt,
        respondedAt: i.respondedAt,
        sender: s ? { id: s._id, name: s.name, username: s.username } : null,
      };
    }),
    page,
    limit,
    total,
  });
});

// 3) Get requests received by the ORIGINAL SENDER of the anonymous messages.
exports.listReceived = asyncHandler(async (req, res) => {
  const { page, limit, skip } = v.pagination(req.query);
  const filter = { sender: req.user._id, ...statusFilter(req.query) };

  const [items, total] = await Promise.all([
    IdentityRequest.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .populate('message', 'content createdAt')
      .populate('requester', 'name username')
      .lean(),
    IdentityRequest.countDocuments(filter),
  ]);

  res.json({
    data: items.map((i) => ({
      id: i._id,
      status: i.status,
      createdAt: i.createdAt,
      respondedAt: i.respondedAt,
      message: i.message ? { id: i.message._id, content: i.message.content, createdAt: i.message.createdAt } : null,
      requester: i.requester ? { id: i.requester._id, name: i.requester.name, username: i.requester.username } : null,
    })),
    page,
    limit,
    total,
  });
});

// 4) Accept / reject. Only the original sender, only while `pending`, decided atomically.
const decide = (status) =>
  asyncHandler(async (req, res) => {
    const request = await IdentityRequest.findOneAndUpdate(
      { _id: req.params.requestId, sender: req.user._id, status: 'pending' },
      { status, respondedAt: new Date() },
      { returnDocument: 'after' }
    ).select('+sender');

    if (!request) {
      const existing = await IdentityRequest.findById(req.params.requestId).select('+sender status');
      if (!existing || String(existing.sender) !== req.user.id) throw new AppError('Request not found', 404);
      throw new AppError(`This request was already ${existing.status}`, 409);
    }

    if (status === 'rejected') {
      return res.json({ message: 'Request rejected, your identity remains hidden', request: { id: request.id, status } });
    }

    // 5) Accepted => create the conversation linked to the original message.
    let conversation;
    try {
      conversation = await Conversation.create({
        sender: request.sender,
        receiver: request.requester,
        originalMessage: request.message,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      conversation = await Conversation.findOne({ originalMessage: request.message });
    }

    res.json({
      message: 'Request accepted, your identity is now visible to the receiver',
      request: { id: request.id, status },
      conversation: { id: conversation.id, originalMessageId: String(conversation.originalMessage) },
    });
  });

exports.acceptRequest = decide('accepted');
exports.rejectRequest = decide('rejected');
