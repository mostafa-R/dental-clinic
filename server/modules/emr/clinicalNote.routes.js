import { Router } from 'express';

import {
  createClinicalNote,
  deleteClinicalNote,
  getClinicalNote,
  listClinicalNotes,
  updateClinicalNote,
} from './clinicalNote.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createClinicalNoteSchema,
  listEmrQuerySchema,
  updateClinicalNoteSchema,
} from './emr.validator.js';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /api/v1/patients/{patientId}/clinical-notes:
 *   get:
 *     tags: [Clinical Notes]
 *     summary: List clinical notes for a patient
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
 *         description: List of clinical notes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     notes:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ClinicalNote' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('emr', 'read'), phiRestrict, validate(listEmrQuerySchema, 'query'), listClinicalNotes);

/**
 * @swagger
 * /api/v1/patients/{patientId}/clinical-notes:
 *   post:
 *     tags: [Clinical Notes]
 *     summary: Create a clinical note
 *     description: Requires `emr:create`. The doctor must belong to the patient's branch and be a doctor. A `nextAppointment` optionally creates the follow-up appointment.
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
 *             required: [doctor]
 *             properties:
 *               doctor: { $ref: '#/components/schemas/ObjectId' }
 *               appointment: { $ref: '#/components/schemas/ObjectId' }
 *               visitDate: { type: string, format: date-time }
 *               chiefComplaint: { type: string, maxLength: 1000 }
 *               examination: { type: string, maxLength: 2000 }
 *               diagnosis: { type: string, maxLength: 1000 }
 *               plan: { type: string, maxLength: 2000 }
 *               attachments:
 *                 type: array
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string, enum: [xray, photo, document] }
 *                     url: { type: string, maxLength: 1024 }
 *                     caption: { type: string, maxLength: 200 }
 *               nextAppointment: { type: string, format: date-time }
 *               nextAppointmentNotes: { type: string, maxLength: 500 }
 *     responses:
 *       '201':
 *         description: Clinical note created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     note: { $ref: '#/components/schemas/ClinicalNote' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/', protect, checkPermission('emr', 'create'), phiRestrict, validate(createClinicalNoteSchema), createClinicalNote);

/**
 * @swagger
 * /api/v1/patients/{patientId}/clinical-notes/{noteId}:
 *   get:
 *     tags: [Clinical Notes]
 *     summary: Get a clinical note
 *     description: Requires `emr:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Clinical note details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     note: { $ref: '#/components/schemas/ClinicalNote' }
 *       '400':
 *         description: Invalid clinical note id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:noteId', protect, checkPermission('emr', 'read'), phiRestrict, getClinicalNote);

/**
 * @swagger
 * /api/v1/patients/{patientId}/clinical-notes/{noteId}:
 *   patch:
 *     tags: [Clinical Notes]
 *     summary: Update a clinical note
 *     description: Requires `emr:update`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               visitDate: { type: string, format: date-time }
 *               chiefComplaint: { type: string, maxLength: 1000 }
 *               examination: { type: string, maxLength: 2000 }
 *               diagnosis: { type: string, maxLength: 1000 }
 *               plan: { type: string, maxLength: 2000 }
 *               attachments:
 *                 type: array
 *                 maxItems: 20
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string, enum: [xray, photo, document] }
 *                     url: { type: string, maxLength: 1024 }
 *                     caption: { type: string, maxLength: 200 }
 *               nextAppointment: { type: string, format: date-time }
 *               nextAppointmentNotes: { type: string, maxLength: 500 }
 *     responses:
 *       '200':
 *         description: Clinical note updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     note: { $ref: '#/components/schemas/ClinicalNote' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/:noteId', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateClinicalNoteSchema), updateClinicalNote);

/**
 * @swagger
 * /api/v1/patients/{patientId}/clinical-notes/{noteId}:
 *   delete:
 *     tags: [Clinical Notes]
 *     summary: Delete a clinical note
 *     description: Requires `emr:delete`. Soft-deletes the note.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: noteId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Clinical note deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: Clinical note deleted }
 *       '400':
 *         description: Invalid clinical note id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.delete('/:noteId', protect, checkPermission('emr', 'delete'), phiRestrict, deleteClinicalNote);

export default router;
