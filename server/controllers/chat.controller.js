import Message from '../models/Message.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import { emitToChat } from '../socket/index.js';
import { sendSuccess } from '../utils/sendSuccess.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { toObjectId, currentTenant, filterByBranch } from '../utils/branchScope.js';

export const sendChatMessage = asyncHandler(async (req, res) => {
  const { recipient, channel, content } = req.validatedBody;
  const branch = req.user.branch;
  const tenant = currentTenant(req);

  if (!branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  const message = await Message.create({
    branch: toObjectId(branch),
    tenant: tenant ? toObjectId(tenant) : null,
    sender: toObjectId(req.user._id),
    recipient: recipient ? toObjectId(recipient) : null,
    channel: channel || null,
    content,
  });

  const populated = await message.populate('sender', 'name');
  const sender = populated.sender
    ? { _id: populated.sender._id, name: populated.sender.name }
    : { _id: message.sender, name: 'Unknown' };
  emitToChat({
    recipient,
    senderId: req.user._id,
    channel,
    tenantId: tenant ? String(tenant) : null,
    event: 'chat:message',
    payload: { ...populated.toObject(), sender },
  });

  return sendSuccess(res, { message: populated.toObject() }, 201);
});

export const listChatMessages = asyncHandler(async (req, res) => {
  const { recipient, channel, limit, before, after } = req.validatedQuery;
  const branch = req.user.branch;

  if (!branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  const filter = { branch: toObjectId(branch) };
  if (recipient) {
    filter.$or = [
      { sender: toObjectId(req.user._id), recipient: toObjectId(recipient) },
      { sender: toObjectId(recipient), recipient: toObjectId(req.user._id) },
    ];
  }
  if (channel) filter.channel = channel;

  if (before || after) {
    filter.createdAt = {};
    if (before) filter.createdAt.$lt = new Date(before);
    if (after) filter.createdAt.$gt = new Date(after);
  }

  const messages = await Message.find(filter)
    .populate('sender', 'name')
    .sort({ createdAt: -1 })
    .limit(limit);

  const formatted = messages.map((m) => ({
    ...m.toObject(),
    sender: m.sender ? { _id: m.sender._id, name: m.sender.name } : null,
  }));

  return sendSuccess(res, { messages: formatted.reverse() });
});

export const markMessagesRead = asyncHandler(async (req, res) => {
  const { messageIds } = req.validatedBody;
  const branch = req.user.branch;

  if (!branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  const msgDocs = await Message.find(
    { _id: { $in: messageIds.map(toObjectId) }, branch: toObjectId(branch), recipient: toObjectId(req.user._id) },
    'sender',
  );

  await Message.updateMany(
    { _id: { $in: messageIds.map(toObjectId) }, branch: toObjectId(branch), recipient: toObjectId(req.user._id) },
    { isRead: true, readAt: new Date() },
  );

  const senders = [...new Set(msgDocs.map((m) => String(m.sender)))];
  senders.forEach((senderId) => {
    emitToChat({ recipient: senderId, tenantId: null, event: 'chat:read', payload: { messageIds, readerId: req.user._id } });
  });

  return sendSuccess(res, { updated: messageIds.length });
});

export const getUnreadCounts = asyncHandler(async (req, res) => {
  const branch = req.user.branch;
  if (!branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  const dmResults = await Message.aggregate([
    { $match: { branch: toObjectId(branch), recipient: toObjectId(req.user._id), isRead: false } },
    { $group: { _id: '$sender', count: { $sum: 1 } } },
  ]);

  const channelResults = await Message.aggregate([
    { $match: { branch: toObjectId(branch), channel: { $ne: null }, sender: { $ne: toObjectId(req.user._id) }, isRead: false } },
    { $group: { _id: '$channel', count: { $sum: 1 } } },
  ]);

  const unread = {};
  dmResults.forEach((r) => {
    unread[String(r._id)] = r.count;
  });
  channelResults.forEach((r) => {
    unread[`channel:${r._id}`] = r.count;
  });

  return sendSuccess(res, { unread });
});

export const listStaffForChat = asyncHandler(async (req, res) => {
  const branch = req.user.branch;
  const tenant = currentTenant(req);

  if (!branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  const filter = { branch: toObjectId(branch), isActive: true, _id: { $ne: toObjectId(req.user._id) } };
  if (tenant) filter.tenant = toObjectId(tenant);

  const staff = await User.find(filter)
    .select('name email role')
    .sort('name');

  return sendSuccess(res, { staff: staff.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role })) });
});