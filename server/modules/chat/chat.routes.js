import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { getUnreadCounts, listChatMessages, listStaffForChat, markChannelRead, markMessagesRead, sendChatMessage } from './chat.controller.js';
import { listMessagesSchema, markChannelReadSchema, markReadSchema, sendMessageSchema } from './chat.validator.js';

const router = Router();

router.post('/', protect, checkPermission('chat', 'create'), validate(sendMessageSchema, 'body'), sendChatMessage);
router.get('/', protect, checkPermission('chat', 'read'), validate(listMessagesSchema, 'query'), listChatMessages);
router.patch('/read', protect, checkPermission('chat', 'update'), validate(markReadSchema, 'body'), markMessagesRead);
router.post('/channel-read', protect, checkPermission('chat', 'update'), validate(markChannelReadSchema, 'body'), markChannelRead);
router.get('/staff', protect, checkPermission('chat', 'read'), listStaffForChat);
router.get('/unread', protect, checkPermission('chat', 'read'), getUnreadCounts);

export default router;
