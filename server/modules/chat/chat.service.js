import Message from './message.model.js';
import User from '../users/user.model.js';
import { toObjectId, currentTenant } from '../../utils/branchScope.js';

export async function sendMessage({ branch, tenant, senderId, recipient, channel, content }) {
  const message = await Message.create({
    branch: toObjectId(branch),
    tenant: tenant ? toObjectId(tenant) : null,
    sender: toObjectId(senderId),
    recipient: recipient ? toObjectId(recipient) : null,
    channel: channel || null,
    content,
  });
  const populated = await message.populate('sender', 'name');
  const sender = populated.sender
    ? { _id: populated.sender._id, name: populated.sender.name }
    : { _id: message.sender, name: 'Unknown' };
  return { message: populated.toObject(), sender };
}

export async function listMessages(branch, { recipient, senderId, channel, limit, before, after }) {
  const filter = { branch: toObjectId(branch) };
  if (recipient) {
    filter.$or = [
      { sender: toObjectId(senderId), recipient: toObjectId(recipient) },
      { sender: toObjectId(recipient), recipient: toObjectId(senderId) },
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
  return messages.map((m) => ({
    ...m.toObject(),
    sender: m.sender ? { _id: m.sender._id, name: m.sender.name } : null,
  })).reverse();
}

export async function markRead(branch, userId, messageIds) {
  const ids = messageIds.map(toObjectId);
  const msgDocs = await Message.find(
    { _id: { $in: ids }, branch: toObjectId(branch), recipient: toObjectId(userId) },
    'sender',
  );
  await Message.updateMany(
    { _id: { $in: ids }, branch: toObjectId(branch), recipient: toObjectId(userId) },
    { isRead: true, readAt: new Date() },
  );
  return [...new Set(msgDocs.map((m) => String(m.sender)))];
}

export async function getUnreadCounts(branch, userId) {
  const dmResults = await Message.aggregate([
    { $match: { branch: toObjectId(branch), recipient: toObjectId(userId), isRead: false } },
    { $group: { _id: '$sender', count: { $sum: 1 } } },
  ]);
  const channelResults = await Message.aggregate([
    { $match: { branch: toObjectId(branch), channel: { $ne: null }, sender: { $ne: toObjectId(userId) }, isRead: false } },
    { $group: { _id: '$channel', count: { $sum: 1 } } },
  ]);
  const unread = {};
  dmResults.forEach((r) => { unread[String(r._id)] = r.count; });
  channelResults.forEach((r) => { unread[`channel:${r._id}`] = r.count; });
  return unread;
}

export async function listStaff(branch, tenant) {
  const filter = { branch: toObjectId(branch), isActive: true };
  if (tenant) filter.tenant = toObjectId(tenant);
  const staff = await User.find(filter).select('name email role').sort('name');
  return staff.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role }));
}
