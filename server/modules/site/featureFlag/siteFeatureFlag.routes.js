import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../../../middleware/audit.js';
import { require2faSuperAdmin } from '../../../middleware/require2fa.js';
import { authorizeSite, protectSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { getTenantModules, setModules, toggleModule } from './siteFeatureFlag.controller.js';

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/feature-flags/{tenantId}:
 *   get:
 *     tags: [Site Feature Flags]
 *     summary: Get tenant modules and feature flags
 *     description: Site realm. Requires `super_admin` or `admin` role.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant modules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: object
 *                       additionalProperties:
 *                         type: boolean
 *       '400':
 *         description: Invalid tenant id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:tenantId', authorizeSite('super_admin', 'admin'), getTenantModules);

/**
 * @swagger
 * /api/v1/site/feature-flags/{tenantId}/toggle:
 *   put:
 *     tags: [Site Feature Flags]
 *     summary: Toggle a single module
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation.
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
 *             required: [module, enabled]
 *             properties:
 *               module: { type: string }
 *               enabled: { type: boolean }
 *     responses:
 *       '200':
 *         description: Module toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: object
 *                       additionalProperties:
 *                         type: boolean
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
  '/:tenantId/toggle',
  authorizeSite('super_admin'),
  require2faSuperAdmin,
  audit('feature.toggle', 'tenant'),
  validate(z.object({ module: z.string(), enabled: z.boolean() })),
  toggleModule,
);

/**
 * @swagger
 * /api/v1/site/feature-flags/{tenantId}/modules:
 *   put:
 *     tags: [Site Feature Flags]
 *     summary: Replace tenant modules
 *     description: Site realm. Requires `super_admin` role and 2FA confirmation. Sets the full module set at once.
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
 *             required: [modules]
 *             properties:
 *               modules: { type: array, items: { type: string } }
 *     responses:
 *       '200':
 *         description: Modules replaced
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: object
 *                       additionalProperties:
 *                         type: boolean
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
  '/:tenantId/modules',
  authorizeSite('super_admin'),
  require2faSuperAdmin,
  audit('feature.toggle', 'tenant'),
  validate(z.object({ modules: z.array(z.string()) })),
  setModules,
);

export default router;
