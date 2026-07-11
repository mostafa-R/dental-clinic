import { Router } from 'express';
import { z } from 'zod';

import {
  addPayment,
  createInvoice,
  getBillingSummary,
  getInvoice,
  getInvoiceAging,
  listInvoices,
  refundPayment,
  updateInvoice,
  voidInvoice,
} from './invoice.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import {
  createInvoiceSchema,
  listInvoicesQuerySchema,
  paymentSchema,
  refundSchema,
  updateInvoiceSchema,
} from './invoice.validator.js';

const voidInvoiceSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
});

const router = Router();

router.get('/', protect, checkPermission('billing', 'read'), validate(listInvoicesQuerySchema, 'query'), listInvoices);
router.get('/summary', protect, checkPermission('billing', 'read'), getBillingSummary);
router.get('/aging', protect, checkPermission('billing', 'read'), getInvoiceAging);
router.get('/:id', protect, checkPermission('billing', 'read'), getInvoice);
router.post('/', protect, checkPermission('billing', 'create'), validate(createInvoiceSchema), createInvoice);
router.patch('/:id', protect, checkPermission('billing', 'update'), validate(updateInvoiceSchema), updateInvoice);
router.post('/:id/payments', protect, checkPermission('billing', 'update'), validate(paymentSchema), addPayment);
router.post('/:id/refund', protect, checkPermission('billing', 'update'), validate(refundSchema), refundPayment);
router.post('/:id/void', protect, checkPermission('billing', 'update'), validate(voidInvoiceSchema), voidInvoice);

export default router;
