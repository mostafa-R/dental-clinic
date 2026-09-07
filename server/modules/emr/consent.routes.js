import { Router } from 'express';

import {
  createConsent,
  declineConsent,
  deleteConsent,
  getConsent,
  listConsents,
  signConsent,
  updateConsent,
  verifyConsent,
  withdrawConsent,
} from './consent.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createConsentSchema,
  declineConsentSchema,
  listConsentQuerySchema,
  signConsentSchema,
  updateConsentSchema,
  withdrawConsentSchema,
} from './consent.validator.js';

const router = Router({ mergeParams: true });

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents:
 *   get:
 *     tags: [Consents]
 *     summary: List a patient's consents
 *     description: Requires `consents:read`. PHI is masked during impersonation.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - $ref: '#/components/parameters/PaginationPage'
 *       - $ref: '#/components/parameters/PaginationLimit'
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, sent, signed, declined, withdrawn, expired] }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *     responses:
 *       '200':
 *         description: Consents list
 *       '401': { $ref: '#/components/responses/Unauthorized' }
 *       '403': { $ref: '#/components/responses/Forbidden' }
 */
router.get('/', protect, checkPermission('consents', 'read'), phiRestrict, validate(listConsentQuerySchema, 'query'), listConsents);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents:
 *   post:
 *     tags: [Consents]
 *     summary: Create a consent (draft)
 *     description: Requires `consents:create`. The version auto-increments per patient and type.
 *     security: [{ cookieAuth: [] }]
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
 *             required: [type, title]
 *             properties:
 *               type: { type: string, enum: [treatment, imaging, anesthesia, financial, general, electronic_communication] }
 *               title: { type: string, maxLength: 200 }
 *               summary: { type: string, maxLength: 1000 }
 *               termsText: { type: string, maxLength: 20000 }
 *               treatmentPlan: { $ref: '#/components/schemas/ObjectId' }
 *               attachmentUrl: { type: string }
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       '201':
 *         description: Consent created
 *       '401': { $ref: '#/components/responses/Unauthorized' }
 *       '403': { $ref: '#/components/responses/Forbidden' }
 */
router.post('/', protect, checkPermission('consents', 'create'), phiRestrict, validate(createConsentSchema), createConsent);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents/{consentId}:
 *   get:
 *     tags: [Consents]
 *     summary: Get a consent
 *     description: Requires `consents:read`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Consent details
 */
router.get('/:consentId', protect, checkPermission('consents', 'read'), phiRestrict, getConsent);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents/{consentId}:
 *   patch:
 *     tags: [Consents]
 *     summary: Update a draft/sent consent
 *     description: Requires `consents:update`. Frozen once signed — return 409.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Consent updated
 *       '409':
 *         description: Signed/declined/withdrawn consent is immutable
 */
router.patch('/:consentId', protect, checkPermission('consents', 'update'), phiRestrict, validate(updateConsentSchema), updateConsent);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents/{consentId}/sign:
 *   post:
 *     tags: [Consents]
 *     summary: Sign a consent (electronic signature)
 *     description: Requires `consents:update`. Stores an HMAC signature hash and freezes the record.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [signature]
 *             properties:
 *               signature:
 *                 type: object
 *                 required: [method, name]
 *                 properties:
 *                   method: { type: string, enum: [typed, drawn, otp, staff_photo, patient_photo] }
 *                   name: { type: string, maxLength: 120 }
 *                   phone: { type: string }
 *                   imageUrl: { type: string }
 *               patientStatement: { type: string, maxLength: 1000 }
 *     responses:
 *       '200':
 *         description: Consent signed
 */
router.post('/:consentId/sign', protect, checkPermission('consents', 'update'), phiRestrict, validate(signConsentSchema), signConsent);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents/{consentId}/decline:
 *   post:
 *     tags: [Consents]
 *     summary: Decline a consent
 *     description: Requires `consents:update`.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Consent declined
 */
router.post('/:consentId/decline', protect, checkPermission('consents', 'update'), phiRestrict, validate(declineConsentSchema), declineConsent);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents/{consentId}/withdraw:
 *   post:
 *     tags: [Consents]
 *     summary: Withdraw a signed consent (patient revokes)
 *     description: Requires `consents:update`. The record is preserved for audit.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Consent withdrawn
 */
router.post('/:consentId/withdraw', protect, checkPermission('consents', 'update'), phiRestrict, validate(withdrawConsentSchema), withdrawConsent);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents/{consentId}/verify:
 *   get:
 *     tags: [Consents]
 *     summary: Verify a signature hash (tamper-evidence)
 *     description: Requires `consents:read`. Recomputes and compares the stored HMAC.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Verification result
 */
router.get('/:consentId/verify', protect, checkPermission('consents', 'read'), phiRestrict, verifyConsent);

/**
 * @swagger
 * /api/v1/patients/{patientId}/consents/{consentId}:
 *   delete:
 *     tags: [Consents]
 *     summary: Delete (soft) a draft/sent consent
 *     description: Requires `consents:delete`. Signed records cannot be deleted — withdraw instead.
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - in: path
 *         name: consentId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Consent deleted
 */
router.delete('/:consentId', protect, checkPermission('consents', 'delete'), phiRestrict, deleteConsent);

export default router;