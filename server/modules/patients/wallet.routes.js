import { Router } from 'express';

import * as walletController from './wallet.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { addWalletTransactionSchema } from './wallet.validator.js';

const router = Router({ mergeParams: true });

/* Wallet */
router.get('/', protect, checkPermission('billing', 'read'), walletController.getWallet);
router.post('/transactions', protect, checkPermission('billing', 'update'), validate(addWalletTransactionSchema), walletController.addWalletTransaction);

export default router;
