import { Router } from 'express';

import {
  addTreatmentItem,
  archiveTreatmentPlan,
  createTreatmentPlan,
  generateInvoice,
  getTreatmentPlan,
  listTreatmentPlans,
  removeTreatmentItem,
  updateTreatmentItem,
  updateTreatmentPlan,
} from './treatmentPlan.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createTreatmentItemSchema,
  createTreatmentPlanSchema,
  listEmrQuerySchema,
  updateTreatmentItemSchema,
  updateTreatmentPlanSchema,
} from './emr.validator.js';
import { generateInvoiceSchema } from '../accounting/accounting.validator.js';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans:
 *   get:
 *     tags: [Treatment Plans]
 *     summary: List treatment plans for a patient
 *     description: Requires `emr:read`. PHI is masked during impersonation.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, completed, archived] }
 *       - in: query
 *         name: appointment
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: List of treatment plans
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plans:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TreatmentPlan' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('emr', 'read'), phiRestrict, validate(listEmrQuerySchema, 'query'), listTreatmentPlans);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans:
 *   post:
 *     tags: [Treatment Plans]
 *     summary: Create a treatment plan
 *     description: Requires `emr:create`. A `nextAppointment` optionally creates the follow-up appointment.
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
 *             required: [title, items]
 *             properties:
 *               title: { type: string, minLength: 1, maxLength: 120 }
 *               diagnosis: { type: string, maxLength: 1000 }
 *               status: { type: string, enum: [active, completed, archived], default: active }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items: { $ref: '#/components/schemas/TreatmentPlanItem' }
 *               nextAppointment: { type: string, format: date-time }
 *               nextAppointmentNotes: { type: string, maxLength: 500 }
 *     responses:
 *       '201':
 *         description: Treatment plan created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', protect, checkPermission('emr', 'create'), phiRestrict, validate(createTreatmentPlanSchema), createTreatmentPlan);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans/{planId}:
 *   get:
 *     tags: [Treatment Plans]
 *     summary: Get a treatment plan
 *     description: Requires `emr:read`.
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
 *     responses:
 *       '200':
 *         description: Treatment plan details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *       '400':
 *         description: Invalid plan id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:planId', protect, checkPermission('emr', 'read'), phiRestrict, getTreatmentPlan);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans/{planId}:
 *   patch:
 *     tags: [Treatment Plans]
 *     summary: Update a treatment plan
 *     description: Requires `emr:update`. Status transitions are guarded (`active` → `completed`/`archived`).
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
 *               title: { type: string, minLength: 1, maxLength: 120 }
 *               diagnosis: { type: string, maxLength: 1000 }
 *               status: { type: string, enum: [active, completed, archived] }
 *               nextAppointment: { type: string, format: date-time }
 *               nextAppointmentNotes: { type: string, maxLength: 500 }
 *     responses:
 *       '200':
 *         description: Treatment plan updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Invalid status transition
 */
router.patch('/:planId', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateTreatmentPlanSchema), updateTreatmentPlan);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans/{planId}:
 *   delete:
 *     tags: [Treatment Plans]
 *     summary: Archive a treatment plan
 *     description: Requires `emr:delete`. Marks the plan as `archived`.
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
 *     responses:
 *       '200':
 *         description: Treatment plan archived
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *       '400':
 *         description: Invalid plan id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:planId', protect, checkPermission('emr', 'delete'), phiRestrict, archiveTreatmentPlan);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans/{planId}/items:
 *   post:
 *     tags: [Treatment Plans]
 *     summary: Add a treatment item
 *     description: Requires `emr:create`. Adds a procedure item to the plan.
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
 *             required: [procedureName]
 *             properties:
 *               tooth: { type: integer, minimum: 1, maximum: 32, nullable: true }
 *               surfaces:
 *                 type: array
 *                 items: { type: string, enum: [mesial, distal, buccal, lingual, occlusal] }
 *               procedureCode: { type: string, maxLength: 32 }
 *               procedureName: { type: string, minLength: 1, maxLength: 120 }
 *               description: { type: string, maxLength: 500 }
 *               estimatedCost: { type: number, minimum: 0, default: 0 }
 *               status: { type: string, enum: [pending, in_progress, completed, cancelled] }
 *               appointment: { $ref: '#/components/schemas/ObjectId' }
 *               notes: { type: string, maxLength: 500 }
 *     responses:
 *       '201':
 *         description: Treatment item added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:planId/items', protect, checkPermission('emr', 'create'), phiRestrict, validate(createTreatmentItemSchema), addTreatmentItem);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans/{planId}/items/{itemId}:
 *   patch:
 *     tags: [Treatment Plans]
 *     summary: Update a treatment item
 *     description: Requires `emr:update`. Marking an item `completed` stamps `completedDate` automatically.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tooth: { type: integer, minimum: 1, maximum: 32, nullable: true }
 *               surfaces:
 *                 type: array
 *                 items: { type: string, enum: [mesial, distal, buccal, lingual, occlusal] }
 *               procedureCode: { type: string, maxLength: 32 }
 *               procedureName: { type: string, minLength: 1, maxLength: 120 }
 *               description: { type: string, maxLength: 500 }
 *               estimatedCost: { type: number, minimum: 0 }
 *               status: { type: string, enum: [pending, in_progress, completed, cancelled] }
 *               completedDate: { type: string, format: date-time }
 *               appointment: { $ref: '#/components/schemas/ObjectId' }
 *               notes: { type: string, maxLength: 500 }
 *     responses:
 *       '200':
 *         description: Treatment item updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:planId/items/:itemId', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateTreatmentItemSchema), updateTreatmentItem);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans/{planId}/items/{itemId}:
 *   delete:
 *     tags: [Treatment Plans]
 *     summary: Remove a treatment item
 *     description: Requires `emr:delete`. A plan must keep at least one item; invoiced or completed items cannot be removed.
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
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Treatment item removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *       '400':
 *         description: Invalid item id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Cannot remove the last, invoiced, or completed item
 */
router.delete('/:planId/items/:itemId', protect, checkPermission('emr', 'delete'), phiRestrict, removeTreatmentItem);

/**
 * @swagger
 * /api/v1/patients/{patientId}/treatment-plans/{planId}/invoice:
 *   post:
 *     tags: [Treatment Plans]
 *     summary: Generate an invoice from plan items
 *     description: Requires `emr:update`. Creates an invoice from the selected plan items, marking them invoiced.
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
 *             required: [itemIds]
 *             properties:
 *               itemIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items: { type: string }
 *               discount: { type: number, minimum: 0 }
 *               tax: { type: number, minimum: 0 }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       '201':
 *         description: Invoice generated
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
 *                     plan: { $ref: '#/components/schemas/TreatmentPlan' }
 *                     deductions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           item: { type: string }
 *                           deductions: { type: array, items: { $ref: '#/components/schemas/StockTransaction' } }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: A selected item has already been invoiced
 */
router.post('/:planId/invoice', protect, checkPermission('emr', 'update'), phiRestrict, validate(generateInvoiceSchema), generateInvoice);

export default router;
