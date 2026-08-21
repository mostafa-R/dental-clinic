import { Router } from 'express';

import {
  getDentalChart,
  updateDentalChart,
  updateTooth,
} from './dentalChart.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import { updateDentalChartSchema, updateToothSchema } from './emr.validator.js';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /api/v1/patients/{patientId}/dental-chart:
 *   get:
 *     tags: [Dental Chart]
 *     summary: Get the dental chart
 *     description: Requires `emr:read`. Creates a fresh sound chart on first access. PHI is masked during impersonation.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Dental chart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     chart: { $ref: '#/components/schemas/DentalChart' }
 *       '400':
 *         description: Invalid patient id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/', protect, checkPermission('emr', 'read'), phiRestrict, getDentalChart);

/**
 * @swagger
 * /api/v1/patients/{patientId}/dental-chart:
 *   patch:
 *     tags: [Dental Chart]
 *     summary: Update the dental chart
 *     description: Requires `emr:update`. Updates dentition type, notes, or bulk-merges teeth by number.
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
 *             properties:
 *               dentitionType: { type: string, enum: [permanent, primary, mixed] }
 *               notes: { type: string, maxLength: 2000 }
 *               teeth:
 *                 type: array
 *                 maxItems: 32
 *                 items:
 *                   type: object
 *                   properties:
 *                     number: { type: integer, minimum: 1, maximum: 32 }
 *                     state: { type: string, enum: [sound, caries, filled, crown, root_canal, implant, missing, bridge, extraction_scheduled, fractured] }
 *                     surfaces: { $ref: '#/components/schemas/ToothSurfaces' }
 *                     notes: { type: string, maxLength: 500 }
 *     responses:
 *       '200':
 *         description: Dental chart updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     chart: { $ref: '#/components/schemas/DentalChart' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateDentalChartSchema), updateDentalChart);

/**
 * @swagger
 * /api/v1/patients/{patientId}/dental-chart/teeth/{number}:
 *   patch:
 *     tags: [Dental Chart]
 *     summary: Update a single tooth
 *     description: Requires `emr:update`. The interactive hot path used when a doctor edits one tooth.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: number
 *         required: true
 *         description: Tooth number (1-32).
 *         schema: { type: integer, minimum: 1, maximum: 32 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               state: { type: string, enum: [sound, caries, filled, crown, root_canal, implant, missing, bridge, extraction_scheduled, fractured] }
 *               surfaces: { $ref: '#/components/schemas/ToothSurfaces' }
 *               notes: { type: string, maxLength: 500 }
 *     responses:
 *       '200':
 *         description: Tooth updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     chart: { $ref: '#/components/schemas/DentalChart' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.patch('/teeth/:number', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateToothSchema), updateTooth);

export default router;
