import { Router } from 'express';

import {
  listInstallmentPlans,
  createInstallmentPlan,
  updateInstallmentPlan,
  payInstallment,
} from './installmentPlan.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createInstallmentPlanSchema,
  payInstallmentSchema,
  updateInstallmentPlanSchema,
  listInstallmentPlansSchema,
} from './wallet.validator.js';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /api/v1/patients/{patientId}/installments:
 *   get:
 *     tags: [Installment Plans]
 *     summary: List a patient's installment plans
 *     description: Requires `billing:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, completed, defaulted] }
 *       - { $ref: '#/components/parameters/PaginationPage' }
 *       - { $ref: '#/components/parameters/PaginationLimit' }
 *     responses:
 *       '200':
 *         description: Paginated list of installment plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     installmentPlans:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/InstallmentPlan' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/', protect, checkPermission('billing', 'read'), phiRestrict, validate(listInstallmentPlansSchema, 'query'), listInstallmentPlans);

/**
 * @swagger
 * /api/v1/patients/{patientId}/installments:
 *   post:
 *     tags: [Installment Plans]
 *     summary: Create an installment plan
 *     description: Requires `billing:create`. The sum of installments must equal `totalAmount`. Only one active plan per invoice.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, totalAmount, installments]
 *             properties:
 *               title: { type: string, minLength: 1, maxLength: 200 }
 *               totalAmount: { type: number, minimum: 0, exclusiveMinimum: true }
 *               installments:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 60
 *                 items:
 *                   type: object
 *                   required: [dueDate, amount]
 *                   properties:
 *                     dueDate: { type: string, format: date-time }
 *                     amount: { type: number, minimum: 0, exclusiveMinimum: true }
 *               frequency: { type: string, enum: [weekly, biweekly, monthly, custom] }
 *               invoice: { $ref: '#/components/schemas/ObjectId' }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       '201':
 *         description: Installment plan created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     installmentPlan: { $ref: '#/components/schemas/InstallmentPlan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', protect, checkPermission('billing', 'create'), phiRestrict, validate(createInstallmentPlanSchema), createInstallmentPlan);

/**
 * @swagger
 * /api/v1/patients/{patientId}/installments/{planId}:
 *   patch:
 *     tags: [Installment Plans]
 *     summary: Update an installment plan
 *     description: Requires `billing:update`. Completed/defaulted plans are immutable.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, minLength: 1, maxLength: 200 }
 *               notes: { type: string, maxLength: 1000 }
 *               status: { type: string, enum: [active, completed, defaulted] }
 *     responses:
 *       '200':
 *         description: Installment plan updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     installmentPlan: { $ref: '#/components/schemas/InstallmentPlan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.patch('/:planId', protect, checkPermission('billing', 'update'), phiRestrict, validate(updateInstallmentPlanSchema), updateInstallmentPlan);

/**
 * @swagger
 * /api/v1/patients/{patientId}/installments/{planId}/pay:
 *   post:
 *     tags: [Installment Plans]
 *     summary: Pay an installment
 *     description: Requires `billing:update`. Executed in a transaction to prevent double-payment races. Wallet payments debit the patient wallet.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: planId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [installmentId, amount]
 *             properties:
 *               installmentId: { $ref: '#/components/schemas/ObjectId' }
 *               amount: { type: number, minimum: 0, exclusiveMinimum: true }
 *               paymentMethod: { type: string, enum: [cash, card, transfer, wallet] }
 *               paymentRef: { type: string, maxLength: 100 }
 *               notes: { type: string, maxLength: 300 }
 *     responses:
 *       '200':
 *         description: Installment paid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     installmentPlan: { $ref: '#/components/schemas/InstallmentPlan' }
 *                     installment: { $ref: '#/components/schemas/Installment' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/:planId/pay', protect, checkPermission('billing', 'update'), phiRestrict, validate(payInstallmentSchema), payInstallment);

export default router;
