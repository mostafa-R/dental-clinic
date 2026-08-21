import { Router } from 'express';

import {
  createDrawing,
  createExpense,
  deleteDrawing,
  deleteExpense,
  getAccountingSummary,
  listCommissions,
  listDrawings,
  listExpenses,
  updateCommissionStatus,
} from './accounting.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  accountingSummaryQuerySchema,
  createDrawingSchema,
  createExpenseSchema,
  listCommissionQuerySchema,
  listDrawingQuerySchema,
  listExpenseQuerySchema,
  payCommissionSchema,
} from './accounting.validator.js';

const router = Router();

/**
 * @swagger
 * /api/v1/accounting/expenses:
 *   get:
 *     tags: [Accounting]
 *     summary: List expenses
 *     description: Requires `accounting:read`. Filters by category and date range.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [salary, rent, utilities, supplies, maintenance, marketing, other] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       '200':
 *         description: List of expenses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     expenses:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Expense' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/expenses', protect, checkPermission('accounting', 'read'), phiRestrict, validate(listExpenseQuerySchema, 'query'), listExpenses);

/**
 * @swagger
 * /api/v1/accounting/expenses:
 *   post:
 *     tags: [Accounting]
 *     summary: Record an expense
 *     description: Requires `accounting:create`. Expenses cannot be paid from a patient wallet.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, description, amount]
 *             properties:
 *               category: { type: string, enum: [salary, rent, utilities, supplies, maintenance, marketing, other] }
 *               description: { type: string, minLength: 1, maxLength: 300 }
 *               amount: { type: number, minimum: 0.01 }
 *               date: { type: string, format: date-time }
 *               paymentMethod: { type: string, enum: [cash, bank, card] }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '201':
 *         description: Expense recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     expense: { $ref: '#/components/schemas/Expense' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/expenses', protect, checkPermission('accounting', 'create'), phiRestrict, validate(createExpenseSchema), createExpense);

/**
 * @swagger
 * /api/v1/accounting/expenses/{id}:
 *   delete:
 *     tags: [Accounting]
 *     summary: Delete an expense
 *     description: Requires `accounting:delete`. Soft-deletes the expense.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Expense deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Expense deleted }
 *       '400':
 *         description: Invalid expense id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/expenses/:id', protect, checkPermission('accounting', 'delete'), phiRestrict, deleteExpense);

/**
 * @swagger
 * /api/v1/accounting/drawings:
 *   get:
 *     tags: [Accounting]
 *     summary: List owner drawings
 *     description: Requires `accounting:read`. Filters by date range.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       '200':
 *         description: List of owner drawings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     drawings:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/OwnerDrawing' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/drawings', protect, checkPermission('accounting', 'read'), phiRestrict, validate(listDrawingQuerySchema, 'query'), listDrawings);

/**
 * @swagger
 * /api/v1/accounting/drawings:
 *   post:
 *     tags: [Accounting]
 *     summary: Record an owner drawing
 *     description: Requires `accounting:create`. The owner must be a clinic admin or system role. Wallet drawings debit the patient's wallet atomically.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [owner, amount]
 *             properties:
 *               owner: { $ref: '#/components/schemas/ObjectId' }
 *               amount: { type: number, minimum: 0.01 }
 *               paymentMethod: { type: string, enum: [cash, bank, card, wallet] }
 *               patient: { $ref: '#/components/schemas/ObjectId' }
 *               description: { type: string, maxLength: 300 }
 *               date: { type: string, format: date-time }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '201':
 *         description: Owner drawing recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     drawing: { $ref: '#/components/schemas/OwnerDrawing' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/drawings', protect, checkPermission('accounting', 'create'), phiRestrict, validate(createDrawingSchema), createDrawing);

/**
 * @swagger
 * /api/v1/accounting/drawings/{id}:
 *   delete:
 *     tags: [Accounting]
 *     summary: Delete an owner drawing
 *     description: Requires `accounting:delete`. Soft-deletes the drawing and credits the patient wallet back if it was paid from a wallet.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Owner drawing deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Drawing deleted }
 *       '400':
 *         description: Invalid drawing id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/drawings/:id', protect, checkPermission('accounting', 'delete'), phiRestrict, deleteDrawing);

/**
 * @swagger
 * /api/v1/accounting/commissions:
 *   get:
 *     tags: [Accounting]
 *     summary: List commissions
 *     description: Requires `accounting:read`. Filters by doctor and status.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: doctor
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, paid, void] }
 *     responses:
 *       '200':
 *         description: List of commissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     commissions:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Commission' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/commissions', protect, checkPermission('accounting', 'read'), phiRestrict, validate(listCommissionQuerySchema, 'query'), listCommissions);

/**
 * @swagger
 * /api/v1/accounting/commissions/{id}:
 *   patch:
 *     tags: [Accounting]
 *     summary: Mark a commission as paid
 *     description: Requires `accounting:update`. Sets the commission status to `paid` and stamps the payment date.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [paid] }
 *     responses:
 *       '200':
 *         description: Commission updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     commission: { $ref: '#/components/schemas/Commission' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/commissions/:id', protect, checkPermission('accounting', 'update'), phiRestrict, validate(payCommissionSchema), updateCommissionStatus);

/**
 * @swagger
 * /api/v1/accounting/summary:
 *   get:
 *     tags: [Accounting]
 *     summary: Get accounting summary (P&L)
 *     description: Requires `accounting:read`. Returns profit & loss figures for an optional date range.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       '200':
 *         description: Accounting summary
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
 *                         totalBilled: { type: number }
 *                         totalCollected: { type: number }
 *                         totalExpenses: { type: number }
 *                         totalDrawings: { type: number }
 *                         pendingCommissions: { type: number }
 *                         paidCommissions: { type: number }
 *                         netProfit: { type: number }
 *                     expenseByCategory:
 *                       type: array
 *                       items: { type: object, properties: { category: { type: string }, total: { type: number }, count: { type: integer } } }
 *                     revenueByMethod:
 *                       type: array
 *                       items: { type: object, properties: { method: { type: string }, total: { type: number }, count: { type: integer } } }
 *                     monthlyRevenue:
 *                       type: array
 *                       items: { type: object, properties: { year: { type: integer }, month: { type: integer }, revenue: { type: number }, count: { type: integer } } }
 *                     commissions:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties: { total: { type: number }, count: { type: integer } }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/summary', protect, checkPermission('accounting', 'read'), phiRestrict, validate(accountingSummaryQuerySchema, 'query'), getAccountingSummary);

export default router;
