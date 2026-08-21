import { Router } from 'express';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { z } from 'zod';
import { getAuditLogs, getAuditActions } from './siteAudit.controller.js';

const router = Router();

router.use(protectSite);

const auditQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(200).optional(),
  action: z.string().optional(),
  adminId: z.string().optional(),
  targetType: z.enum(['tenant', 'branch', 'admin', 'subscription', 'plan', 'platform']).optional(),
  targetId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * @swagger
 * /api/v1/site/audit-logs:
 *   get:
 *     tags: [Site Audit]
 *     summary: List audit logs
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role. Supports filtering by action, admin, target, and date range.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: adminId
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: targetType
 *         schema: { type: string, enum: [tenant, branch, admin, subscription, plan, platform] }
 *       - in: query
 *         name: targetId
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       '200':
 *         description: List of audit logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/AuditLog' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', authorizeSite('super_admin', 'admin', 'support'), validate(auditQuerySchema, 'query'), getAuditLogs);

/**
 * @swagger
 * /api/v1/site/audit-logs/actions:
 *   get:
 *     tags: [Site Audit]
 *     summary: List distinct audit actions
 *     description: Site realm. Requires `super_admin`, `admin`, or `support` role. Useful for building filter dropdowns.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Distinct actions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     actions:
 *                       type: array
 *                       items: { type: string }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/actions', authorizeSite('super_admin', 'admin', 'support'), getAuditActions);

export default router;
