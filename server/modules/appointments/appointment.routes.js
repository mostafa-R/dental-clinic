import { Router } from 'express';

import {
  cancelAppointment,
  createAppointment,
  getAppointment,
  listAppointments,
  transitionAppointment,
  updateAppointment,
} from './appointment.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  transitionSchema,
  updateAppointmentSchema,
} from './appointment.validator.js';

const router = Router();

/**
 * @swagger
 * /api/v1/appointments:
 *   get:
 *     tags: [Appointments]
 *     summary: List appointments
 *     description: Requires `appointments:read`. Filters by date range, doctor, patient (id or search term), or status. PHI is masked during impersonation.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Start of the date range (inclusive).
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: End of the date range (inclusive).
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: A single day to filter by (overrides from/to).
 *       - in: query
 *         name: doctor
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: query
 *         name: patient
 *         schema: { type: string }
 *         description: Patient ObjectId or a search term matched against patientId/name/phone.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, confirmed, checked_in, in_progress, completed, cancelled, no_show]
 *     responses:
 *       '200':
 *         description: List of appointments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointments:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Appointment' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('appointments', 'read'), phiRestrict, validate(listAppointmentsQuerySchema, 'query'), listAppointments);

/**
 * @swagger
 * /api/v1/appointments/{id}:
 *   get:
 *     tags: [Appointments]
 *     summary: Get an appointment
 *     description: Requires `appointments:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Appointment details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment: { $ref: '#/components/schemas/Appointment' }
 *       '400':
 *         description: Invalid appointment id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', protect, checkPermission('appointments', 'read'), phiRestrict, getAppointment);

/**
 * @swagger
 * /api/v1/appointments:
 *   post:
 *     tags: [Appointments]
 *     summary: Create an appointment
 *     description: Requires `appointments:create`. Validates the patient/doctor references, clinic working hours, doctor availability, and prevents double-booking (doctor and patient).
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patient, doctor]
 *             properties:
 *               patient: { $ref: '#/components/schemas/ObjectId' }
 *               doctor: { $ref: '#/components/schemas/ObjectId' }
 *               branch: { $ref: '#/components/schemas/ObjectId' }
 *               chair: { type: string, maxLength: 60 }
 *               start: { type: string, format: date-time }
 *               end: { type: string, format: date-time }
 *               status: { type: string, enum: [scheduled, confirmed], default: scheduled }
 *               reason: { type: string, maxLength: 300 }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       '201':
 *         description: Appointment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment: { $ref: '#/components/schemas/Appointment' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '409':
 *         description: Doctor or patient already has an overlapping appointment, or the doctor is unavailable
 */
router.post('/', protect, checkPermission('appointments', 'create'), phiRestrict, validate(createAppointmentSchema), createAppointment);

/**
 * @swagger
 * /api/v1/appointments/{id}:
 *   patch:
 *     tags: [Appointments]
 *     summary: Update an appointment
 *     description: Requires `appointments:update`. Re-runs availability and overlap checks when time, doctor, or patient change.
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
 *               patient: { $ref: '#/components/schemas/ObjectId' }
 *               doctor: { $ref: '#/components/schemas/ObjectId' }
 *               chair: { type: string, maxLength: 60 }
 *               start: { type: string, format: date-time }
 *               end: { type: string, format: date-time }
 *               reason: { type: string, maxLength: 300 }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       '200':
 *         description: Appointment updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment: { $ref: '#/components/schemas/Appointment' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Overlapping appointment or doctor unavailable
 */
router.patch('/:id', protect, checkPermission('appointments', 'update'), phiRestrict, validate(updateAppointmentSchema), updateAppointment);

/**
 * @swagger
 * /api/v1/appointments/{id}/status:
 *   patch:
 *     tags: [Appointments]
 *     summary: Transition appointment status
 *     description: Requires `appointments:update`. Only the status field is mutated (e.g. `scheduled` → `checked_in` → `completed`). Billing and medical data are never altered by this route.
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
 *               status:
 *                 type: string
 *                 enum: [scheduled, confirmed, checked_in, in_progress, completed, cancelled, no_show]
 *     responses:
 *       '200':
 *         description: Appointment status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment: { $ref: '#/components/schemas/Appointment' }
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
router.patch('/:id/status', protect, checkPermission('appointments', 'update'), phiRestrict, validate(transitionSchema), transitionAppointment);

/**
 * @swagger
 * /api/v1/appointments/{id}:
 *   delete:
 *     tags: [Appointments]
 *     summary: Cancel an appointment
 *     description: Requires `appointments:delete`. Marks the appointment as `cancelled`; only valid from non-final statuses.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Appointment cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     appointment: { $ref: '#/components/schemas/Appointment' }
 *       '400':
 *         description: Invalid appointment id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 *       '409':
 *         description: Appointment cannot be cancelled in its current status
 */
router.delete('/:id', protect, checkPermission('appointments', 'delete'), phiRestrict, cancelAppointment);

export default router;
