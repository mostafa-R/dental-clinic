import { Router } from 'express';
import { z } from 'zod';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { getSettings, updateSettings, connect, getQrCode, disconnect, status, testMessage } from './whatsapp.controller.js';

const whatsappSettingsSchema = z.object({
  provider: z.enum(['whatsapp_web', 'cloud_api', 'twilio']).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  settings: z.object({
    appointmentReminder: z.boolean().optional(),
    appointmentConfirm: z.boolean().optional(),
    reminderHours: z.number().int().min(1).max(168).optional(),
  }).optional(),
});

const testMessageSchema = z.object({
  to: z
    .string()
    .regex(
      /^\+?[1-9]\d{7,14}(@c\.us)?$/,
      'Phone number must be in E.164 format (e.g. +15551234567)',
    ),
  message: z.string().min(1, 'Message required').max(1000),
});

const router = Router();

/**
 * @swagger
 * /api/v1/whatsapp/settings:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get WhatsApp settings
 *     description: Requires `settings:read`.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Current WhatsApp settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings:
 *                       type: object
 *                       properties:
 *                         provider: { type: string, enum: [whatsapp_web, cloud_api, twilio] }
 *                         enabled: { type: boolean }
 *                         config: { type: object }
 *                         settings:
 *                           type: object
 *                           properties:
 *                             appointmentReminder: { type: boolean }
 *                             appointmentConfirm: { type: boolean }
 *                             reminderHours: { type: integer }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/settings', protect, checkPermission('settings', 'read'), getSettings);

/**
 * @swagger
 * /api/v1/whatsapp/settings:
 *   put:
 *     tags: [WhatsApp]
 *     summary: Update WhatsApp settings
 *     description: Requires `settings:update`. Switching the provider triggers re-initialization of the client.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider: { type: string, enum: [whatsapp_web, cloud_api, twilio] }
 *               enabled: { type: boolean }
 *               config: { type: object }
 *               settings:
 *                 type: object
 *                 properties:
 *                   appointmentReminder: { type: boolean }
 *                   appointmentConfirm: { type: boolean }
 *                   reminderHours: { type: integer, minimum: 1, maximum: 168 }
 *     responses:
 *       '200':
 *         description: WhatsApp settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings: { type: object }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.put('/settings', protect, checkPermission('settings', 'update'), validate(whatsappSettingsSchema), updateSettings);

/**
 * @swagger
 * /api/v1/whatsapp/connect:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Connect WhatsApp
 *     description: Requires `settings:update`. Starts the WhatsApp client connection (pairing for whatsapp_web).
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Connection initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *                     qr: { type: string, nullable: true, description: QR code data URL when pairing is needed }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/connect', protect, checkPermission('settings', 'update'), connect);

/**
 * @swagger
 * /api/v1/whatsapp/qr:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get current QR code
 *     description: Requires `settings:read`. Returns the pending pairing QR code if available.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Current QR code
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     qr: { type: string, nullable: true }
 *                     qrExpiresAt: { type: string, format: date-time, nullable: true }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/qr', protect, checkPermission('settings', 'read'), getQrCode);

/**
 * @swagger
 * /api/v1/whatsapp/disconnect:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Disconnect WhatsApp
 *     description: Requires `settings:update`. Disconnects the current WhatsApp client.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Disconnected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/disconnect', protect, checkPermission('settings', 'update'), disconnect);

/**
 * @swagger
 * /api/v1/whatsapp/status:
 *   get:
 *     tags: [WhatsApp]
 *     summary: Get WhatsApp connection status
 *     description: Requires `settings:read`.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Connection status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     connected: { type: boolean }
 *                     provider: { type: string }
 *                     status: { type: string }
 *                     phoneNumber: { type: string, nullable: true }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/status', protect, checkPermission('settings', 'read'), status);

/**
 * @swagger
 * /api/v1/whatsapp/test:
 *   post:
 *     tags: [WhatsApp]
 *     summary: Send a test message
 *     description: Requires `settings:update`. Sends a test WhatsApp message to the given number.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to, message]
 *             properties:
 *               to:
 *                 type: string
 *                 description: Phone number in E.164 format (e.g. +15551234567).
 *                 pattern: ^\+?[1-9]\d{7,14}(@c\.us)?$
 *               message: { type: string, minLength: 1, maxLength: 1000 }
 *     responses:
 *       '200':
 *         description: Test message sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/test', protect, checkPermission('settings', 'update'), validate(testMessageSchema), testMessage);

export default router;
