import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getUnreadCounts, listChatMessages, listStaffForChat, markChannelRead, markMessagesRead, sendChatMessage } from './chat.controller.js';
import { listMessagesSchema, markChannelReadSchema, markReadSchema, sendMessageSchema } from './chat.validator.js';

const router = Router();

router.post('/', protect, validate(sendMessageSchema, 'body'), sendChatMessage);
router.get('/', protect, validate(listMessagesSchema, 'query'), listChatMessages);
router.patch('/read', protect, validate(markReadSchema, 'body'), markMessagesRead);
router.post('/channel-read', protect, validate(markChannelReadSchema, 'body'), markChannelRead);
router.get('/staff', protect, listStaffForChat);
router.get('/unread', protect, getUnreadCounts);

export default router;
