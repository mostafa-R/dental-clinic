import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { getUnreadCounts, listChatMessages, listStaffForChat, markChannelRead, markMessagesRead, sendChatMessage } from './chat.controller.js';
import { listMessagesSchema, markChannelReadSchema, markReadSchema, sendMessageSchema } from './chat.validator.js';

const router = Router();

/**
 * @swagger
 * /api/v1/chat:
 *   post:
 *     tags: [Chat]
 *     summary: Send a chat message
 *     description: Requires `chat:create`. The user must be assigned to a branch. Either `recipient` (direct message) or `channel` must be provided, but not both.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               recipient: { $ref: '#/components/schemas/ObjectId' }
 *               channel: { type: string, enum: [doctors, accounting, general] }
 *               content: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       '201':
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/ChatMessage' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', protect, checkPermission('chat', 'create'), validate(sendMessageSchema, 'body'), sendChatMessage);

/**
 * @swagger
 * /api/v1/chat:
 *   get:
 *     tags: [Chat]
 *     summary: List chat messages
 *     description: Requires `chat:read`. Lists a direct conversation or a channel. The user must be assigned to a branch.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: recipient
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: channel
 *         schema: { type: string, enum: [doctors, accounting, general] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *       - in: query
 *         name: before
 *         schema: { type: string, format: date-time }
 *         description: Return messages created before this time.
 *       - in: query
 *         name: after
 *         schema: { type: string, format: date-time }
 *         description: Return messages created after this time.
 *     responses:
 *       '200':
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     messages:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ChatMessage' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('chat', 'read'), validate(listMessagesSchema, 'query'), listChatMessages);

/**
 * @swagger
 * /api/v1/chat/read:
 *   patch:
 *     tags: [Chat]
 *     summary: Mark messages as read
 *     description: Requires `chat:update`.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageIds]
 *             properties:
 *               messageIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Messages marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     updated: { type: integer, description: Number of messages marked read }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.patch('/read', protect, checkPermission('chat', 'update'), validate(markReadSchema, 'body'), markMessagesRead);

/**
 * @swagger
 * /api/v1/chat/channel-read:
 *   post:
 *     tags: [Chat]
 *     summary: Mark a channel as viewed
 *     description: Requires `chat:update`. Marks the current user's channel view as up to date.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [channel]
 *             properties:
 *               channel: { type: string, minLength: 1, maxLength: 50 }
 *     responses:
 *       '200':
 *         description: Channel marked as viewed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok: { type: boolean, example: true }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/channel-read', protect, checkPermission('chat', 'update'), validate(markChannelReadSchema, 'body'), markChannelRead);

/**
 * @swagger
 * /api/v1/chat/staff:
 *   get:
 *     tags: [Chat]
 *     summary: List staff available for chat
 *     description: Requires `chat:read`. Returns the current branch's staff, optionally filtered by tenant.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: List of staff
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     staff:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/staff', protect, checkPermission('chat', 'read'), listStaffForChat);

/**
 * @swagger
 * /api/v1/chat/unread:
 *   get:
 *     tags: [Chat]
 *     summary: Get unread message counts
 *     description: Requires `chat:read`. Returns per-sender and per-channel unread counts for the current user.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Unread counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     unread:
 *                       type: object
 *                       description: Per-sender and channel unread counts.
 *                       additionalProperties: true
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/unread', protect, checkPermission('chat', 'read'), getUnreadCounts);

export default router;
