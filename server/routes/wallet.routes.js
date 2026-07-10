import { Router } from 'express';

import * as walletController from '../controllers/wallet.controller.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { validate } from '../middleware/validate.js';
import {
  createInstallmentPlanSchema,
  payInstallmentSchema,
  updateInstallmentPlanSchema,
  listInstallmentPlansSchema,
  listWalletTransactionsSchema,
  addWalletTransactionSchema,
} from '../validators/wallet.validator.js';

const router = Router({ mergeParams: true });

/* Wallet */
router.get('/', protect, checkPermission('billing', 'read'), walletController.getWallet);
router.post('/transactions', protect, checkPermission('billing', 'update'), validate(addWalletTransactionSchema), walletController.addWalletTransaction);

/* Installment plans */
router.get('/installments', protect, checkPermission('billing', 'read'), validate(listInstallmentPlansSchema), walletController.listInstallmentPlans);
router.post('/installments', protect, checkPermission('billing', 'create'), validate(createInstallmentPlanSchema), walletController.createInstallmentPlan);
router.patch('/installments/:planId', protect, checkPermission('billing', 'update'), validate(updateInstallmentPlanSchema), walletController.updateInstallmentPlan);
router.post('/installments/:planId/pay', protect, checkPermission('billing', 'update'), validate(payInstallmentSchema), walletController.payInstallment);

export default router;
