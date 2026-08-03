import { Router } from 'express';
import { z } from 'zod';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { createSiteAdmin, getSiteMe, initiateRecovery, siteLogin, siteLogout, siteRefresh, verifyRecoveryOtp } from './siteAuth.controller.js';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const recoveryInitSchema = z.object({
  email: z.string().email('Invalid email address'),
  recoveryKey: z.string().min(1, 'Recovery key is required'),
});

const recoveryVerifySchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  recoveryToken: z.string().min(1, 'Recovery token is required'),
});

const createAdminSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['super_admin', 'admin', 'support']).optional(),
});

const router = Router();

// Public routes
router.post('/login', validate(loginSchema), siteLogin);
// Recovery is now a two-step process: initiate -> verify OTP
router.post('/recover/initiate', validate(recoveryInitSchema), initiateRecovery);
router.post('/recover/verify', validate(recoveryVerifySchema), verifyRecoveryOtp);

// Protected routes
router.get('/me', protectSite, getSiteMe);
router.post('/refresh', siteRefresh);
router.post('/logout', protectSite, siteLogout);

// Create site admin (only super_admin)
router.post(
  '/create',
  protectSite,
  authorizeSite('super_admin'),
  validate(createAdminSchema),
  createSiteAdmin
);

export default router;
