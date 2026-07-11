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
  to: z.string().min(4, 'Phone number required'),
  message: z.string().min(1, 'Message required').max(1000),
});

const router = Router();

router.get('/settings', protect, checkPermission('settings', 'read'), getSettings);
router.put('/settings', protect, checkPermission('settings', 'update'), validate(whatsappSettingsSchema), updateSettings);
router.post('/connect', protect, checkPermission('settings', 'update'), connect);
router.get('/qr', protect, checkPermission('settings', 'read'), getQrCode);
router.post('/disconnect', protect, checkPermission('settings', 'update'), disconnect);
router.get('/status', protect, checkPermission('settings', 'read'), status);
router.post('/test', protect, checkPermission('settings', 'update'), validate(testMessageSchema), testMessage);

export default router;
