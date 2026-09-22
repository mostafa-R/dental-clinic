import { Router } from 'express';
import { authorizeSite, protectSite, requireTenantAccess } from '../../../middleware/siteAuth.js';
import { getUsersByTenant, searchUsers } from './siteUser.controller.js';

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
 *       - bearerAuth: []
 *       - siteCookieAuth: []
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

/**
 * @swagger
 * /api/v1/site/users:
 *   get:
 *     tags: [Site Users]
 *     summary: Search users across tenants
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role. Returns a capped list of matching users with their tenant.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 6, maximum: 20 }
 *     responses:
 *       '200':
 *         description: Matching users
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
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', authorizeSite('super_admin', 'admin', 'support'), searchUsers);

export default router;
