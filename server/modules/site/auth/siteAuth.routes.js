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

/**
 * @swagger
 * /api/v1/site/auth/login:
 *   post:
 *     tags: [Site Auth]
 *     summary: Site admin login
 *     description: Public. Authenticates a site admin. If 2FA is enabled, returns a challenge token that must be completed via `POST /site/2fa/verify-login`; otherwise sets the `site_access` cookie.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       '200':
 *         description: Login result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/SiteAdmin' }
 *                     twoFactorRequired: { type: boolean }
 *                     challengeToken: { type: string, nullable: true }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/login', validate(loginSchema), siteLogin);

/**
 * @swagger
 * /api/v1/site/auth/recover/initiate:
 *   post:
 *     tags: [Site Auth]
 *     summary: Initiate account recovery
 *     description: Public. Step 1 of recovery. Validates email and recovery key, then issues a recovery token and sends a 6-digit OTP by email.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, recoveryKey]
 *             properties:
 *               email: { type: string }
 *               recoveryKey: { type: string }
 *     responses:
 *       '200':
 *         description: Recovery initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     recoveryToken: { type: string }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/recover/initiate', validate(recoveryInitSchema), initiateRecovery);

/**
 * @swagger
 * /api/v1/site/auth/recover/verify:
 *   post:
 *     tags: [Site Auth]
 *     summary: Verify recovery OTP
 *     description: Public. Step 2 of recovery. Verifies the 6-digit OTP with the recovery token to complete recovery.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, recoveryToken]
 *             properties:
 *               email: { type: string }
 *               otp: { type: string, description: 6-digit OTP }
 *               recoveryToken: { type: string }
 *     responses:
 *       '200':
 *         description: Recovery verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     verified: { type: boolean, example: true }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/recover/verify', validate(recoveryVerifySchema), verifyRecoveryOtp);

/**
 * @swagger
 * /api/v1/site/auth/me:
 *   get:
 *     tags: [Site Auth]
 *     summary: Get current site admin
 *     description: Site realm. Returns the authenticated site admin profile.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Current admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin: { $ref: '#/components/schemas/SiteAdmin' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/me', protectSite, getSiteMe);

/**
 * @swagger
 * /api/v1/site/auth/refresh:
 *   post:
 *     tags: [Site Auth]
 *     summary: Refresh site access token
 *     description: Public. Rotates the site session using the refresh cookie.
 *     responses:
 *       '200':
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/refresh', siteRefresh);

/**
 * @swagger
 * /api/v1/site/auth/logout:
 *   post:
 *     tags: [Site Auth]
 *     summary: Logout site admin
 *     description: Site realm. Clears site auth cookies.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Logged out
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
 */
router.post('/logout', protectSite, siteLogout);

/**
 * @swagger
 * /api/v1/site/auth/create:
 *   post:
 *     tags: [Site Auth]
 *     summary: Create a site admin
 *     description: Site realm. Requires `super_admin` role. Creates an additional site admin account.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, minLength: 2 }
 *               email: { type: string }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [super_admin, admin, support] }
 *     responses:
 *       '201':
 *         description: Admin created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin: { $ref: '#/components/schemas/SiteAdmin' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  '/create',
  protectSite,
  authorizeSite('super_admin'),
  validate(createAdminSchema),
  createSiteAdmin
);

export default router;
