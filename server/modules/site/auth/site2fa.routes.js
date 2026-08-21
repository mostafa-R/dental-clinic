import { Router } from 'express';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { require2faChallenge } from '../../../middleware/require2fa.js';
import { audit } from '../../../middleware/audit.js';
import { validate } from '../../../middleware/validate.js';
import { z } from 'zod';
import {
  setup2fa, verify2fa, disable2fa, get2faStatus, verify2faLogin,
} from './site2fa.controller.js';
import { setAuthCookies } from '../../../utils/jwt.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';

const router = Router();

/**
 * @swagger
 * /api/v1/site/2fa/verify-login:
 *   post:
 *     tags: [Site 2FA]
 *     summary: Complete 2FA during login
 *     description: Public. Completes the 2FA challenge started by `POST /site/auth/login`. On success sets the `site_access` cookie.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [adminId, challengeToken]
 *             properties:
 *               adminId: { type: string }
 *               token: { type: string, description: 6-digit authenticator code }
 *               backupCode: { type: string }
 *               challengeToken: { type: string }
 *     responses:
 *       '200':
 *         description: 2FA verified, session established
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
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/verify-login',
  validate(z.object({
    adminId: z.string(),
    token: z.string().optional(),
    backupCode: z.string().optional(),
    challengeToken: z.string(),
  })),
  require2faChallenge,
  async (req, res, next) => {
    try {
      const { token, backupCode } = req.validatedBody;
      const admin = req._2faAdmin;

      if (!token && !backupCode) {
        return res.status(400).json({ success: false, message: 'Token or backup code required' });
      }

      // Re-verify against the admin from challenge
      req.validatedBody = { adminId: admin._id.toString(), token, backupCode };
      req.params = {};
      const origJson = res.json.bind(res);
      res.json = function (body) {
        res.json = origJson;
        if (body?.success && body?.data?.verified) {
          admin.lastLogin = new Date();
          admin.save().catch(() => {});
          setAuthCookies(res, admin, 'site', { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() });
          return origJson({ success: true, data: { user: admin.toSafeObject() } });
        }
        return origJson(body);
      };
      return next();
    } catch (err) { next(err); }
  },
  verify2faLogin,
);

// Protected: manage 2FA for the authenticated admin
router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/2fa/status:
 *   get:
 *     tags: [Site 2FA]
 *     summary: Get 2FA status
 *     description: Site realm. Returns whether 2FA is enabled for the authenticated admin.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: 2FA status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/status', get2faStatus);

/**
 * @swagger
 * /api/v1/site/2fa/setup:
 *   post:
 *     tags: [Site 2FA]
 *     summary: Start 2FA setup
 *     description: Site realm. Generates a TOTP secret and provisioning URI for the authenticator app. 2FA becomes active after `POST /site/2fa/verify`.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Setup data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     secret: { type: string }
 *                     otpauthUrl: { type: string }
 *                     backupCodes:
 *                       type: array
 *                       items: { type: string }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/setup', setup2fa);

/**
 * @swagger
 * /api/v1/site/2fa/verify:
 *   post:
 *     tags: [Site 2FA]
 *     summary: Enable 2FA
 *     description: Site realm. Verifies a TOTP code to activate 2FA for the authenticated admin.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, minLength: 6, description: 6-digit authenticator code }
 *     responses:
 *       '200':
 *         description: 2FA enabled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean, example: true }
 *                     backupCodes:
 *                       type: array
 *                       items: { type: string }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/verify',
  validate(z.object({ token: z.string().min(6) })),
  audit('2fa.enable', 'admin'),
  verify2fa,
);

/**
 * @swagger
 * /api/v1/site/2fa/disable:
 *   post:
 *     tags: [Site 2FA]
 *     summary: Disable 2FA
 *     description: Site realm. Verifies the current TOTP code and disables 2FA for the authenticated admin.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, minLength: 6, description: 6-digit authenticator code }
 *     responses:
 *       '200':
 *         description: 2FA disabled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean, example: false }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/disable',
  validate(z.object({ token: z.string().min(6) })),
  audit('2fa.disable', 'admin'),
  disable2fa,
);

export default router;
