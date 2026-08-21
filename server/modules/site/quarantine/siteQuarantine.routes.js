import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../../middleware/audit.js';
import { require2faSuperAdmin } from '../../../middleware/require2fa.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { getAbuseChecks, removeQuarantine, setQuarantine } from './siteQuarantine.controller.js';

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/quarantine/{tenantId}/remove:
 *   put:
 *     tags: [Site Quarantine]
 *     summary: Remove a tenant from quarantine
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Quarantine removed
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
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  '/:tenantId/remove',
  authorizeSite('super_admin'),
  require2faSuperAdmin,
  audit('quarantine.remove', 'tenant'),
  removeQuarantine,
);

/**
 * @swagger
 * /api/v1/site/quarantine/{tenantId}:
 *   put:
 *     tags: [Site Quarantine]
 *     summary: Quarantine a tenant
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation. Blocks the tenant and flags it for abuse review.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       '200':
 *         description: Tenant quarantined
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
router.put(
  '/:tenantId',
  authorizeSite('super_admin'),
  require2faSuperAdmin,
  audit('quarantine.set', 'tenant'),
  validate(z.object({ reason: z.string().optional() })),
  setQuarantine,
);

/**
 * @swagger
 * /api/v1/site/quarantine/checks:
 *   get:
 *     tags: [Site Quarantine]
 *     summary: List pending abuse checks
 *     description: Site realm. Requires `super_admin` or `admin` role. Returns tenants flagged by automated abuse detection.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Pending checks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     checks:
 *                       type: array
 *                       items: { type: object }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/checks',
  authorizeSite('super_admin', 'admin'),
  getAbuseChecks,
);

export default router;
