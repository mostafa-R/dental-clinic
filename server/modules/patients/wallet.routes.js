import { Router } from 'express';

import * as walletController from './wallet.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import { addWalletTransactionSchema } from './wallet.validator.js';

const router = Router({ mergeParams: true });

/* Wallet */
/**
 * @swagger
 * /api/v1/patients/{patientId}/wallet:
 *   get:
 *     tags: [Wallets]
 *     summary: Get a patient's wallet
 *     description: Returns the patient's wallet balance and recent transactions. Requires `billing:read`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { $ref: '#/components/schemas/ObjectId' }
 *       - { $ref: '#/components/parameters/PaginationPage' }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *     responses:
 *       '200':
 *         description: Wallet with paginated transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet:
 *                       type: object
 *                       properties:
 *                         _id: { $ref: '#/components/schemas/ObjectId' }
 *                         patient: { $ref: '#/components/schemas/ObjectId' }
 *                         branch: { $ref: '#/components/schemas/ObjectId' }
 *                         balance: { type: number }
 *                         transactions:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WalletTransaction' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       '400':
 *         description: Invalid patient id
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/', protect, checkPermission('billing', 'read'), phiRestrict, walletController.getWallet);

/**
 * @swagger
 * /api/v1/patients/{patientId}/wallet/transactions:
 *   post:
 *     tags: [Wallets]
 *     summary: Add a manual wallet transaction
 *     description: Requires `billing:update`. A wallet debit must reference an invoice, installment, or carry an explicit reference.
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
 *             required: [type, amount]
 *             properties:
 *               type: { type: string, enum: [credit, debit] }
 *               amount: { type: number, minimum: 0.01 }
 *               reference: { type: string, maxLength: 100 }
 *               description: { type: string, maxLength: 300 }
 *               invoice: { $ref: '#/components/schemas/ObjectId' }
 *               installment: { $ref: '#/components/schemas/ObjectId' }
 *     responses:
 *       '200':
 *         description: Transaction recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet: { $ref: '#/components/schemas/Wallet' }
 *                     transaction: { $ref: '#/components/schemas/WalletTransaction' }
 *       '400':
 *         $ref: '#/components/responses/ValidationError'
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/transactions', protect, checkPermission('billing', 'update'), phiRestrict, validate(addWalletTransactionSchema), walletController.addWalletTransaction);

export default router;
