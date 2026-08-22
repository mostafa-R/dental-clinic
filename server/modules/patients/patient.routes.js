import { Router } from 'express';

import {
  archivePatient,
  createPatient,
  findDuplicatePatients,
  getPatient,
  listPatients,
  mergePatients,
  updatePatient,
} from './patient.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createPatientSchema,
  listPatientsQuerySchema,
  mergePatientSchema,
  updatePatientSchema,
} from './patient.validator.js';

const router = Router();

/**
 * @swagger
 * /api/v1/patients:
 *   get:
 *     tags: [Patients]
 *     summary: List patients
 *     description: Requires `patients:read`. Patient records are PHI — fields are masked during impersonation sessions.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 100 }
 *         description: Search by name, phone or patient ID
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ['true', 'false'] }
 *       - { $ref: '#/components/parameters/PaginationPage' }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       '200':
 *         description: Paginated list of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     patients:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Patient' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('patients', 'read'), phiRestrict, validate(listPatientsQuerySchema, 'query'), listPatients);

/**
 * @swagger
 * /api/v1/patients/duplicates:
 *   get:
 *     tags: [Patients]
 *     summary: Find suspected duplicate patient records
 *     description: Requires `patients:read`. Groups active patients that share a phone number or name+date of birth within the same branch.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       '200':
 *         description: Duplicate groups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           matchedOn: { type: string, enum: [phone, name+dob] }
 *                           key: { type: string }
 *                           count: { type: integer }
 *                           patients:
 *                             type: array
 *                             items: { $ref: '#/components/schemas/Patient' }
 *                     total: { type: integer }
 */
router.get('/duplicates', protect, checkPermission('patients', 'read'), phiRestrict, findDuplicatePatients);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   get:
 *     tags: [Patients]
 *     summary: Get a patient
 *     description: Requires `patients:read`. Patient records are PHI — fields are masked during impersonation sessions.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Patient details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     patient: { $ref: '#/components/schemas/Patient' }
 *       '400':
 *         description: Invalid patient id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', protect, checkPermission('patients', 'read'), phiRestrict, getPatient);

/**
 * @swagger
 * /api/v1/patients:
 *   post:
 *     tags: [Patients]
 *     summary: Create a patient
 *     description: Requires `patients:create`. Enforces the tenant's `maxPatients` plan limit. Patient records are PHI.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, phone]
 *             properties:
 *               firstName: { type: string, minLength: 1, maxLength: 60 }
 *               lastName: { type: string, minLength: 1, maxLength: 60 }
 *               phone: { type: string, minLength: 4, maxLength: 30, description: 'Digits, spaces, + and -' }
 *               email: { type: string, format: email, maxLength: 120 }
 *               dateOfBirth: { type: string, format: date-time }
 *               gender: { type: string, enum: [male, female, other, unknown] }
 *               address: { type: string, maxLength: 300 }
 *               medicalHistory: { $ref: '#/components/schemas/MedicalHistory' }
 *               isActive: { type: boolean, default: true }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '201':
 *         description: Patient created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     patient: { $ref: '#/components/schemas/Patient' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '409':
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/', protect, checkPermission('patients', 'create'), phiRestrict, validate(createPatientSchema), createPatient);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   patch:
 *     tags: [Patients]
 *     summary: Update a patient
 *     description: Requires `patients:update`. Patient records are PHI.
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
 *               firstName: { type: string, minLength: 1, maxLength: 60 }
 *               lastName: { type: string, minLength: 1, maxLength: 60 }
 *               phone: { type: string, minLength: 4, maxLength: 30 }
 *               email: { type: string, format: email, maxLength: 120 }
 *               dateOfBirth: { type: string, format: date-time }
 *               gender: { type: string, enum: [male, female, other, unknown] }
 *               address: { type: string, maxLength: 300 }
 *               medicalHistory: { $ref: '#/components/schemas/MedicalHistory' }
 *               isActive: { type: boolean }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Patient updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     patient: { $ref: '#/components/schemas/Patient' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:id', protect, checkPermission('patients', 'update'), phiRestrict, validate(updatePatientSchema), updatePatient);

/**
 * @swagger
 * /api/v1/patients/{id}:
 *   delete:
 *     tags: [Patients]
 *     summary: Archive a patient
 *     description: Soft-deletes (archives) a patient record. Requires `patients:delete`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Patient archived
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Patient archived }
 *       '400':
 *         description: Invalid patient id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:id', protect, checkPermission('patients', 'delete'), phiRestrict, archivePatient);

/**
 * @swagger
 * /api/v1/patients/{id}/merge:
 *   post:
 *     tags: [Patients]
 *     summary: Merge a duplicate patient into another record
 *     description: Requires `patients:update`. All references are repointed to the surviving record, wallet balances combine, and the duplicate is archived with `mergedInto` set.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *         description: The duplicate record to retire
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [duplicateOf]
 *             properties:
 *               duplicateOf: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Patients merged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string }
 *                     mergedId: { $ref: '#/components/schemas/ObjectId' }
 *                     survivorId: { $ref: '#/components/schemas/ObjectId' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/:id/merge', protect, checkPermission('patients', 'update'), phiRestrict, validate(mergePatientSchema), mergePatients);

export default router;
