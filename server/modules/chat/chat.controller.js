import * as chatService from './chat.service.js';
import { emitToChat } from '../../socket/index.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { currentTenant } from '../../utils/branchScope.js';

export const sendChatMessage = asyncHandler(async (req, res) => {
  const { recipient, channel, content } = req.validatedBody;
  const branch = req.user.branch;
  const tenant = currentTenant(req);
  if (!branch) throw ApiError.forbidden('Your account is not assigned to a branch');

  const { message, sender } = await chatService.sendMessage({
    branch, tenant, senderId: req.user._id, recipient, channel, content,
  });

  emitToChat({
    recipient, senderId: req.user._id, channel,
    tenantId: tenant ? String(tenant) : null,
    event: 'chat:message', payload: { ...message, sender },
  });
  return sendSuccess(res, { message }, 201);
});

export const listChatMessages = asyncHandler(async (req, res) => {
  const branch = req.user.branch;
  if (!branch) throw ApiError.forbidden('Your account is not assigned to a branch');

  const messages = await chatService.listMessages(branch, {
    ...req.validatedQuery,
    senderId: req.user._id,
  });
  return sendSuccess(res, { messages });
});

export const markMessagesRead = asyncHandler(async (req, res) => {
  const branch = req.user.branch;
  if (!branch) throw ApiError.forbidden('Your account is not assigned to a branch');

  const tenant = currentTenant(req);
  const senders = await chatService.markRead(branch, req.user._id, req.validatedBody.messageIds);
  senders.forEach((senderId) => {
    emitToChat({
      recipient: senderId, tenantId: tenant ? String(tenant) : null,
      event: 'chat:read',
      payload: { messageIds: req.validatedBody.messageIds, readerId: req.user._id },
    });
  });
  return sendSuccess(res, { updated: req.validatedBody.messageIds.length });
});

export const getUnreadCounts = asyncHandler(async (req, res) => {
  const branch = req.user.branch;
  if (!branch) throw ApiError.forbidden('Your account is not assigned to a branch');
  const unread = await chatService.getUnreadCounts(branch, req.user._id);
  return sendSuccess(res, { unread });
});

export const listStaffForChat = asyncHandler(async (req, res) => {
  const branch = req.user.branch;
  const tenant = currentTenant(req);
  if (!branch) throw ApiError.forbidden('Your account is not assigned to a branch');
  const staff = await chatService.listStaff(branch, tenant);
  return sendSuccess(res, { staff });
});
