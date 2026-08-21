import { Router } from 'express';
import { authorizeSite, protectSite, requireTenantAccess } from '../../../middleware/siteAuth.js';
import { getUsersByTenant } from './siteUser.controller.js';

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/users/by-tenant/{tenantId}:
 *   get:
 *     tags: [Site Users]
 *     summary: Get users for a tenant
 *     description: Site realm. Requires `super_admin` or `admin` role and tenant access.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *       '400':
 *         description: Invalid tenant id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/by-tenant/:tenantId', authorizeSite('super_admin', 'admin'), requireTenantAccess, getUsersByTenant);

export default router;
