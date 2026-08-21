import { Router } from 'express';
import { protectSite, authorizeSite } from '../../../middleware/siteAuth.js';
import { getErrorLogs, getErrorLogStats, resolveErrorLog } from './siteErrorLog.controller.js';

const router = Router();

router.use(protectSite);

/**
 * @swagger
 * /api/v1/site/error-logs:
 *   get:
 *     tags: [Site Error Logs]
 *     summary: List error logs
 *     description: Site realm. Requires `super_admin` or `admin` role.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: List of error logs
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
 *                       items: { $ref: '#/components/schemas/ErrorLog' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', authorizeSite('super_admin', 'admin'), getErrorLogs);

/**
 * @swagger
 * /api/v1/site/error-logs/stats:
 *   get:
 *     tags: [Site Error Logs]
 *     summary: Get error log statistics
 *     description: Site realm. Requires `super_admin` or `admin` role.
 *     security:
 *       - siteAuth: []
 *     responses:
 *       '200':
 *         description: Error log statistics
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
router.get('/stats', authorizeSite('super_admin', 'admin'), getErrorLogStats);

/**
 * @swagger
 * /api/v1/site/error-logs/{id}/resolve:
 *   patch:
 *     tags: [Site Error Logs]
 *     summary: Resolve an error log
 *     description: Site realm. Requires `super_admin` or `admin` role. Marks the error log as resolved.
 *     security:
 *       - siteAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Error log resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     log: { $ref: '#/components/schemas/ErrorLog' }
 *       '400':
 *         description: Invalid error log id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id/resolve', authorizeSite('super_admin', 'admin'), resolveErrorLog);

export default router;
