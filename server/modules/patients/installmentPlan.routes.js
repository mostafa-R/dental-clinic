import { Router } from 'express';

import {
  listInstallmentPlans,
  createInstallmentPlan,
  updateInstallmentPlan,
  payInstallment,
} from './installmentPlan.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import {
  createInstallmentPlanSchema,
  payInstallmentSchema,
  updateInstallmentPlanSchema,
  listInstallmentPlansSchema,
} from './wallet.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('billing', 'read'), validate(listInstallmentPlansSchema, 'query'), listInstallmentPlans);
router.post('/', protect, checkPermission('billing', 'create'), validate(createInstallmentPlanSchema), createInstallmentPlan);
router.patch('/:planId', protect, checkPermission('billing', 'update'), validate(updateInstallmentPlanSchema), updateInstallmentPlan);
router.post('/:planId/pay', protect, checkPermission('billing', 'update'), validate(payInstallmentSchema), payInstallment);

export default router;
