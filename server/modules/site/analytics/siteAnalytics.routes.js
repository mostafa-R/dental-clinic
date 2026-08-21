import { Router } from 'express';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { getGlobalStats, getGrowthData, getTenantUsage } from './siteAnalytics.controller.js';

const router = Router();

// All routes require site admin authentication
router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/analytics/stats:
 *   get:
 *     tags: [Site Analytics]
 *     summary: Get global platform statistics
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role. Aggregates tenants, users, invoices, and revenue across the platform.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Global statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/stats',
  authorizeSite('super_admin', 'admin', 'support'),
  getGlobalStats
);

/**
 * @swagger
 * /api/v1/site/analytics/growth:
 *   get:
 *     tags: [Site Analytics]
 *     summary: Get growth data
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role. Returns time-series growth of tenants, users, and revenue.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Growth data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/growth',
  authorizeSite('super_admin', 'admin', 'support'),
  getGrowthData
);

/**
 * @swagger
 * /api/v1/site/analytics/usage/{tenantId}:
 *   get:
 *     tags: [Site Analytics]
 *     summary: Get tenant usage
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role. Returns usage and activity for a specific tenant.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Tenant usage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: object }
 *       '400':
 *         description: Invalid tenant id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/usage/:tenantId',
  authorizeSite('super_admin', 'admin', 'support'),
  getTenantUsage
);

export default router;
