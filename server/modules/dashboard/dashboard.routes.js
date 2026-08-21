import { Router } from 'express';
import { getStats } from './dashboard.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const router = Router();

/**
 * @swagger
 * /api/v1/dashboard/stats:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get dashboard statistics
 *     description: Requires `dashboard:read`. Returns today's overview, staff and appointment breakdowns, billing outstanding, and the module catalog with enabled flags.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalStaff: { type: integer }
 *                         activeStaff: { type: integer }
 *                         inactiveStaff: { type: integer }
 *                         doctors: { type: integer }
 *                         branches: { type: integer }
 *                         totalPatients: { type: integer }
 *                         todaysAppointments: { type: integer }
 *                         todaysInvoices: { type: integer }
 *                         outstanding: { type: number }
 *                     queueByStatus:
 *                       type: object
 *                       additionalProperties: { type: integer }
 *                     staffByRole:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties: { role: { type: string }, count: { type: integer } }
 *                     recentStaff:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/User' }
 *                     branches:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { $ref: '#/components/schemas/ObjectId' }
 *                           name: { type: string }
 *                           isActive: { type: boolean }
 *                           staffCount: { type: integer }
 *                     modules:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string }
 *                           label: { type: string }
 *                           enabled: { type: boolean }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/stats', protect, checkPermission('dashboard', 'read'), getStats);

export default router;
