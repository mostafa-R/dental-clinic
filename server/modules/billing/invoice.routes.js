import { Router } from 'express';
import { z } from 'zod';

import {
  addPayment,
  createInvoice,
  getBillingSummary,
  getInvoice,
  getInvoiceAging,
  listInvoices,
  refundPayment,
  updateInvoice,
  voidInvoice,
} from './invoice.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkAnyPermission, checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  paymentSchema,
  refundSchema,
  updateInvoiceSchema,
} from './invoice.validator.js';

const voidInvoiceSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});

const router = Router();

/**
 * @swagger
 * /api/v1/billing:
 *   get:
 *     tags: [Billing]
 *     summary: List invoices
 *     description: Requires `billing:read`. Searches by invoice number or patient, and filters by status, patient, or appointment.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 100 }
 *         description: Matches invoiceNo or patient name/patientId/phone.
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [unpaid, partial, paid, void] }
 *       - in: query
 *         name: patient
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: appointment
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: List of invoices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoices:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Invoice' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('billing', 'read'), phiRestrict, validate(listInvoicesQuerySchema, 'query'), listInvoices);

/**
 * @swagger
 * /api/v1/billing/summary:
 *   get:
 *     tags: [Billing]
 *     summary: Get billing summary
 *     description: Requires `billing:read`. Aggregates billed/paid/outstanding totals broken down by invoice status.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Billing summary
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
 *                         count: { type: integer }
 *                         totalBilled: { type: number }
 *                         totalPaid: { type: number }
 *                         outstanding: { type: number }
 *                     byStatus:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status: { type: string }
 *                           count: { type: integer }
 *                           amount: { type: number }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/summary', protect, checkPermission('billing', 'read'), phiRestrict, getBillingSummary);

/**
 * @swagger
 * /api/v1/billing/aging:
 *   get:
 *     tags: [Billing]
 *     summary: Get invoice aging report
 *     description: Requires `billing:read`. Buckets unpaid/partial invoices into current, 1-30, 31-60, and 61+ days overdue.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Aging report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     aging:
 *                       type: object
 *                       properties:
 *                         current: { type: object, properties: { count: { type: integer }, amount: { type: number } } }
 *                         overdue1to30: { type: object, properties: { count: { type: integer }, amount: { type: number } } }
 *                         overdue31to60: { type: object, properties: { count: { type: integer }, amount: { type: number } } }
 *                         overdue61Plus: { type: object, properties: { count: { type: integer }, amount: { type: number } } }
 *                         total: { type: object, properties: { count: { type: integer }, amount: { type: number } } }
 *                     invoices:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Invoice' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/aging', protect, checkPermission('billing', 'read'), phiRestrict, getInvoiceAging);

/**
 * @swagger
 * /api/v1/billing/{id}:
 *   get:
 *     tags: [Billing]
 *     summary: Get an invoice
 *     description: Requires `billing:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Invoice details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice: { $ref: '#/components/schemas/Invoice' }
 *       '400':
 *         description: Invalid invoice id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', protect, checkPermission('billing', 'read'), phiRestrict, getInvoice);

/**
 * @swagger
 * /api/v1/billing:
 *   post:
 *     tags: [Billing]
 *     summary: Create an invoice
 *     description: Requires `billing:create`. Pre-validates the patient and appointment (if given), then creates the invoice and its number inside a transaction. Invoice totals are computed from the line items.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient, items]
 *             properties:
 *               patient: { $ref: '#/components/schemas/ObjectId' }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *               appointment: { $ref: '#/components/schemas/ObjectId' }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [description, quantity, unitPrice]
 *                   properties:
 *                     description: { type: string, maxLength: 200 }
 *                     quantity: { type: number, minimum: 1 }
 *                     unitPrice: { type: number, minimum: 0 }
 *                     discount: { type: number, minimum: 0 }
 *                     tax: { type: number, minimum: 0 }
 *               discount: { type: number, minimum: 0 }
 *               discountType: { type: string, enum: [fixed, percentage], default: fixed }
 *               discountRate: { type: number, minimum: 0, maximum: 100 }
 *               tax: { type: number, minimum: 0 }
 *               taxRate: { type: number, minimum: 0, maximum: 100 }
 *               dueDate: { type: string, format: date-time }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       '201':
 *         description: Invoice created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice: { $ref: '#/components/schemas/Invoice' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', protect, checkPermission('billing', 'create'), phiRestrict, validate(createInvoiceSchema), createInvoice);

/**
 * @swagger
 * /api/v1/billing/{id}:
 *   patch:
 *     tags: [Billing]
 *     summary: Update an invoice
 *     description: Requires `billing:update`. Financial fields (items/discount/tax) cannot be modified on a paid invoice, and void invoices cannot be edited.
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
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [description, quantity, unitPrice]
 *                   properties:
 *                     description: { type: string, maxLength: 200 }
 *                     quantity: { type: number, minimum: 1 }
 *                     unitPrice: { type: number, minimum: 0 }
 *                     discount: { type: number, minimum: 0 }
 *                     tax: { type: number, minimum: 0 }
 *               discount: { type: number, minimum: 0 }
 *               discountType: { type: string, enum: [fixed, percentage] }
 *               discountRate: { type: number, minimum: 0, maximum: 100 }
 *               tax: { type: number, minimum: 0 }
 *               taxRate: { type: number, minimum: 0, maximum: 100 }
 *               dueDate: { type: string, format: date-time }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       '200':
 *         description: Invoice updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice: { $ref: '#/components/schemas/Invoice' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Cannot edit a void invoice or financial fields of a paid invoice
 */
router.patch('/:id', protect, checkPermission('billing', 'update'), phiRestrict, validate(updateInvoiceSchema), updateInvoice);

/**
 * @swagger
 * /api/v1/billing/{id}/payments:
 *   post:
 *     tags: [Billing]
 *     summary: Record a payment
 *     description: Requires `billing:update`. Deduplicated via the `x-idempotency-key` header. Wallet payments debit the patient wallet and a fully-paid invoice accrues the doctor commission atomically.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: header
 *         name: x-idempotency-key
 *         schema: { type: string }
 *         description: Optional key that makes the request idempotent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, method]
 *             properties:
 *               amount: { type: number, minimum: 0.01 }
 *               method: { type: string, enum: [cash, card, transfer, wallet] }
 *               reference: { type: string, maxLength: 200 }
 *               date: { type: string, format: date-time }
 *               notes: { type: string, maxLength: 300 }
 *     responses:
 *       '200':
 *         description: Payment recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice: { $ref: '#/components/schemas/Invoice' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Invoice already fully paid, or payment on a void invoice
 */
router.post('/:id/payments', protect, checkPermission('billing', 'update'), phiRestrict, validate(paymentSchema), addPayment);

/**
 * @swagger
 * /api/v1/billing/{id}/refund:
 *   post:
 *     tags: [Billing]
 *     summary: Refund a payment
 *     description: Requires `billing.delete` or `accounting.update` (PRD §6.6 — reception alone cannot refund). Records a negative payment. Wallet refunds credit the patient wallet; commissions are adjusted proportionally. Deduplicated via `x-idempotency-key`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: header
 *         name: x-idempotency-key
 *         schema: { type: string }
 *         description: Optional key that makes the request idempotent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, minimum: 0.01 }
 *               method: { type: string, enum: [cash, card, transfer, wallet] }
 *               reference: { type: string, maxLength: 200 }
 *               date: { type: string, format: date-time }
 *               notes: { type: string, maxLength: 300 }
 *     responses:
 *       '200':
 *         description: Payment refunded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice: { $ref: '#/components/schemas/Invoice' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Cannot refund a void invoice
 */
router.post('/:id/refund', protect, checkAnyPermission([['billing', 'delete'], ['accounting', 'update']]), phiRestrict, validate(refundSchema), refundPayment);

/**
 * @swagger
 * /api/v1/billing/{id}/void:
 *   post:
 *     tags: [Billing]
 *     summary: Void an invoice
 *     description: Requires `billing:update`. Reverses wallet debits and voids associated commission records atomically.
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 1, maxLength: 500 }
 *     responses:
 *       '200':
 *         description: Invoice voided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice: { $ref: '#/components/schemas/Invoice' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:id/void', protect, checkPermission('billing', 'update'), phiRestrict, validate(voidInvoiceSchema), voidInvoice);

export default router;
