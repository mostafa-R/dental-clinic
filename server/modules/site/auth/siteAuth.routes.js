import { Router } from 'express';
import { z } from 'zod';
import { siteLogin, getSiteMe, siteLogout, siteRefresh, createSiteAdmin } from './siteAuth.controller.js';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const createAdminSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['super_admin', 'admin', 'support']).optional(),
});

const router = Router();

// Public routes
router.post('/login', validate(loginSchema), siteLogin);

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
