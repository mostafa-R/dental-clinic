import { Router } from 'express';

import {
  createPrescription,
  deletePrescription,
  getPrescription,
  getPrescriptionPrint,
  listPrescriptions,
  updatePrescription,
} from './prescription.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createPrescriptionSchema,
  listEmrQuerySchema,
  updatePrescriptionSchema,
} from './emr.validator.js';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /api/v1/patients/{patientId}/prescriptions:
 *   get:
 *     tags: [Prescriptions]
 *     summary: List prescriptions for a patient
 *     description: Requires `prescriptions:read`. PHI is masked during impersonation.
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
 *         description: List of prescriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     prescriptions:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Prescription' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('prescriptions', 'read'), phiRestrict, validate(listEmrQuerySchema, 'query'), listPrescriptions);

/**
 * @swagger
 * /api/v1/patients/{patientId}/prescriptions:
 *   post:
 *     tags: [Prescriptions]
 *     summary: Create a prescription
 *     description: Requires `prescriptions:create`. The doctor must belong to the patient's branch and be a doctor.
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
 *             required: [doctor, medications]
 *             properties:
 *               doctor: { $ref: '#/components/schemas/ObjectId' }
 *               appointment: { $ref: '#/components/schemas/ObjectId' }
 *               diagnosis: { type: string, maxLength: 500 }
 *               medications:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items: { $ref: '#/components/schemas/Medication' }
 *               notes: { type: string, maxLength: 1000 }
 *               issuedAt: { type: string, format: date-time }
 *     responses:
 *       '201':
 *         description: Prescription created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     prescription: { $ref: '#/components/schemas/Prescription' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', protect, checkPermission('prescriptions', 'create'), phiRestrict, validate(createPrescriptionSchema), createPrescription);

/**
 * @swagger
 * /api/v1/patients/{patientId}/prescriptions/{rxId}:
 *   get:
 *     tags: [Prescriptions]
 *     summary: Get a prescription
 *     description: Requires `prescriptions:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: rxId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Prescription details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     prescription: { $ref: '#/components/schemas/Prescription' }
 *       '400':
 *         description: Invalid prescription id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:rxId', protect, checkPermission('prescriptions', 'read'), phiRestrict, getPrescription);

/**
 * @swagger
 * /api/v1/patients/{patientId}/prescriptions/{rxId}/print:
 *   get:
 *     tags: [Prescriptions]
 *     summary: Get A5 print payload for a prescription
 *     description: Requires `prescriptions:read`. Returns the prescription plus clinic letterhead and doctor signature block.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: rxId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Print payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     print:
 *                       type: object
 *                       properties:
 *                         prescription: { $ref: '#/components/schemas/Prescription' }
 *                         clinic:
 *                           type: object
 *                           properties:
 *                             name: { type: string }
 *                             logoUrl: { type: string, nullable: true }
 *                             address: { type: string }
 *                             phone: { type: string }
 *                         doctor:
 *                           type: object
 *                           properties:
 *                             name: { type: string }
 *                             specialty: { type: string }
 *                             signatureUrl: { type: string, nullable: true }
 *                         issuedAt: { type: string, format: date-time }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:rxId/print', protect, checkPermission('prescriptions', 'read'), phiRestrict, getPrescriptionPrint);

/**
 * @swagger
 * /api/v1/patients/{patientId}/prescriptions/{rxId}:
 *   patch:
 *     tags: [Prescriptions]
 *     summary: Update a prescription
 *     description: Requires `prescriptions:update`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: rxId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               diagnosis: { type: string, maxLength: 500 }
 *               notes: { type: string, maxLength: 1000 }
 *               medications:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items: { $ref: '#/components/schemas/Medication' }
 *     responses:
 *       '200':
 *         description: Prescription updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     prescription: { $ref: '#/components/schemas/Prescription' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:rxId', protect, checkPermission('prescriptions', 'update'), phiRestrict, validate(updatePrescriptionSchema), updatePrescription);

/**
 * @swagger
 * /api/v1/patients/{patientId}/prescriptions/{rxId}:
 *   delete:
 *     tags: [Prescriptions]
 *     summary: Delete a prescription
 *     description: Requires `prescriptions:delete`. Soft-deletes the prescription.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: rxId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Prescription deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Prescription deleted }
 *       '400':
 *         description: Invalid prescription id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:rxId', protect, checkPermission('prescriptions', 'delete'), phiRestrict, deletePrescription);

export default router;
