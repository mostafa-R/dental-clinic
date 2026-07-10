import { Router } from 'express';

import {
  addTreatmentItem,
  archiveTreatmentPlan,
  createTreatmentPlan,
  generateInvoice,
  getTreatmentPlan,
  listTreatmentPlans,
  removeTreatmentItem,
  updateTreatmentItem,
  updateTreatmentPlan,
} from '../controllers/treatmentPlan.controller.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { validate } from '../middleware/validate.js';
import {
  createTreatmentItemSchema,
  createTreatmentPlanSchema,
  listEmrQuerySchema,
  updateTreatmentItemSchema,
  updateTreatmentPlanSchema,
} from '../validators/emr.validator.js';
import { generateInvoiceSchema } from '../validators/accounting.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('emr', 'read'), validate(listEmrQuerySchema, 'query'), listTreatmentPlans);
router.post('/', protect, checkPermission('emr', 'create'), validate(createTreatmentPlanSchema), createTreatmentPlan);
router.get('/:planId', protect, checkPermission('emr', 'read'), getTreatmentPlan);
router.patch('/:planId', protect, checkPermission('emr', 'update'), validate(updateTreatmentPlanSchema), updateTreatmentPlan);
router.delete('/:planId', protect, checkPermission('emr', 'delete'), archiveTreatmentPlan);

router.post('/:planId/items', protect, checkPermission('emr', 'create'), validate(createTreatmentItemSchema), addTreatmentItem);
router.patch('/:planId/items/:itemId', protect, checkPermission('emr', 'update'), validate(updateTreatmentItemSchema), updateTreatmentItem);
router.delete('/:planId/items/:itemId', protect, checkPermission('emr', 'delete'), removeTreatmentItem);

router.post('/:planId/invoice', protect, checkPermission('emr', 'update'), validate(generateInvoiceSchema), generateInvoice);

export default router;