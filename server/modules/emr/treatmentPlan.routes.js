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
} from './treatmentPlan.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createTreatmentItemSchema,
  createTreatmentPlanSchema,
  listEmrQuerySchema,
  updateTreatmentItemSchema,
  updateTreatmentPlanSchema,
} from './emr.validator.js';
import { generateInvoiceSchema } from '../accounting/accounting.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('emr', 'read'), phiRestrict, validate(listEmrQuerySchema, 'query'), listTreatmentPlans);
router.post('/', protect, checkPermission('emr', 'create'), phiRestrict, validate(createTreatmentPlanSchema), createTreatmentPlan);
router.get('/:planId', protect, checkPermission('emr', 'read'), phiRestrict, getTreatmentPlan);
router.patch('/:planId', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateTreatmentPlanSchema), updateTreatmentPlan);
router.delete('/:planId', protect, checkPermission('emr', 'delete'), phiRestrict, archiveTreatmentPlan);

router.post('/:planId/items', protect, checkPermission('emr', 'create'), phiRestrict, validate(createTreatmentItemSchema), addTreatmentItem);
router.patch('/:planId/items/:itemId', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateTreatmentItemSchema), updateTreatmentItem);
router.delete('/:planId/items/:itemId', protect, checkPermission('emr', 'delete'), phiRestrict, removeTreatmentItem);

router.post('/:planId/invoice', protect, checkPermission('emr', 'update'), phiRestrict, validate(generateInvoiceSchema), generateInvoice);

export default router;
