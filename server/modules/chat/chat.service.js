import Message from './message.model.js';
import ChannelRead from './channelRead.model.js';
import User from '../users/user.model.js';
import { toObjectId, currentTenant } from '../../utils/branchScope.js';
import ApiError from '../../utils/ApiError.js';

export async function sendMessage({ branch, tenant, senderId, recipient, channel, content }) {
  if (recipient) {
    // Isolation: a DM recipient must exist, be active, and belong to the
    // sender's own branch+tenant. Messages are stored and read branch-scoped,
    // so allowing a cross-branch/cross-tenant recipient would (a) leak message
    // content into another clinic's socket rooms and (b) produce messages the
    // recipient could never list back.
    const recipientUser = await User.findOne({ _id: toObjectId(recipient) })
      .select('tenant branch isActive')
      .lean();
    if (!recipientUser || !recipientUser.isActive) {
      throw ApiError.badRequest('Recipient does not exist', { recipient: 'not found' });
    }
    if (recipientUser.branch && String(recipientUser.branch) !== String(branch)) {
      throw ApiError.badRequest('Recipient does not belong to your branch', {
        recipient: 'branch mismatch',
      });
    }
    if (tenant && String(recipientUser.tenant || '') !== String(tenant)) {
      throw ApiError.badRequest('Recipient does not belong to your clinic', {
        recipient: 'tenant mismatch',
      });
    }
  }

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
  if (!recipient && !channel) {
    throw ApiError.badRequest('Either recipient or channel is required');
  }
  if (recipient && channel) {
    throw ApiError.badRequest('Cannot specify both recipient and channel');
  }
  const filter = { branch: toObjectId(branch) };
  if (recipient) {
    filter.$or = [
      { sender: toObjectId(senderId), recipient: toObjectId(recipient) },
      { sender: toObjectId(recipient), recipient: toObjectId(senderId) },
    ];
  } else if (channel) {
    filter.channel = channel;
  }
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

export async function getUnreadCounts(branch, userId, tenant) {
  const dmResults = await Message.aggregate([
    { $match: { branch: toObjectId(branch), recipient: toObjectId(userId), isRead: false } },
    { $group: { _id: '$sender', count: { $sum: 1 } } },
  ]);

  const channelReadFilter = { branch: toObjectId(branch), user: toObjectId(userId) };
  if (tenant) channelReadFilter.tenant = toObjectId(tenant);
  const channelReadDocs = await ChannelRead.find(channelReadFilter).lean();
  const channelReadMap = {};
  channelReadDocs.forEach((cr) => { channelReadMap[cr.channel] = cr.lastReadAt; });

  const CHANNEL_NAMES = ['doctors', 'accounting', 'general'];
  const channelResults = await Promise.all(
    CHANNEL_NAMES.map(async (ch) => {
      const match = {
        branch: toObjectId(branch),
        channel: ch,
        sender: { $ne: toObjectId(userId) },
      };
      const lastRead = channelReadMap[ch];
      if (lastRead) {
        match.createdAt = { $gt: lastRead };
      }
      const result = await Message.aggregate([
        { $match: match },
        { $group: { _id: '$channel', count: { $sum: 1 } } },
      ]);
      return { channel: ch, count: result[0]?.count || 0 };
    }),
  );

  const unread = {};
  dmResults.forEach((r) => { unread[String(r._id)] = r.count; });
  channelResults.forEach((r) => {
    if (r.count > 0) {
      unread[`channel:${r.channel}`] = r.count;
    }
  });
  return unread;
}

export async function markChannelViewed(branch, userId, channel, tenant) {
  const filter = { branch: toObjectId(branch), user: toObjectId(userId), channel };
  if (tenant) filter.tenant = toObjectId(tenant);
  await ChannelRead.findOneAndUpdate(
    filter,
    { lastReadAt: new Date() },
    { upsert: true },
  );
}

export async function listStaff(branch, tenant, excludeUserId) {
  const filter = { branch: toObjectId(branch), isActive: true };
  if (tenant) filter.tenant = toObjectId(tenant);
  if (excludeUserId) filter._id = { $ne: toObjectId(excludeUserId) };
  const staff = await User.find(filter).select('name email roleId').populate('roleId', 'name').sort('name');
  return staff.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.roleId?.name || '' }));
}
