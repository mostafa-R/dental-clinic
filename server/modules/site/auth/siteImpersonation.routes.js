import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../../middleware/audit.js';
import { require2fa } from '../../../middleware/require2fa.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { endImpersonation, startImpersonation } from './siteImpersonation.controller.js';

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/impersonation/start:
 *   post:
 *     tags: [Site Impersonation]
 *     summary: Start impersonating a clinic user
 *     description: Site realm. Requires `super_admin` or `admin` role and 2FA confirmation. Switches the site session to act on behalf of the clinic user. PHI stays masked for the impersonator.
 *     security:
 *       - siteAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, tenantId]
 *             properties:
 *               userId: { $ref: '#/components/schemas/ObjectId' }
 *               tenantId: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Impersonation started
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
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/start',
  authorizeSite('super_admin', 'admin'),
  require2fa,
  audit('impersonation.start', 'tenant'),
  validate(z.object({
    userId: z.string(),
    tenantId: z.string(),
  })),
  startImpersonation,
);

/**
 * @swagger
 * /api/v1/site/impersonation/end:
 *   post:
 *     tags: [Site Impersonation]
 *     summary: End impersonation
 *     description: Site realm. Requires `super_admin` or `admin` role. Returns to the site admin session.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Impersonation ended
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
router.post(
  '/end',
  authorizeSite('super_admin', 'admin'),
  audit('impersonation.end', 'user'),
  endImpersonation,
);

export default router;
