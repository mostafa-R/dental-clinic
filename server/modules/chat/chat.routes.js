import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sendChatMessage, listChatMessages, markMessagesRead, getUnreadCounts, listStaffForChat } from './chat.controller.js';
import { sendMessageSchema, listMessagesSchema, markReadSchema } from './chat.validator.js';

const router = Router();

router.post('/', protect, validate(sendMessageSchema, 'body'), sendChatMessage);
router.get('/', protect, validate(listMessagesSchema, 'query'), listChatMessages);
router.patch('/read', protect, validate(markReadSchema, 'body'), markMessagesRead);
router.get('/staff', protect, listStaffForChat);
router.get('/unread', protect, getUnreadCounts);

export default router;
