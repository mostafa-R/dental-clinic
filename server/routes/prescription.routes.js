import { Router } from 'express';

import {
  createPrescription,
  deletePrescription,
  getPrescription,
  listPrescriptions,
  updatePrescription,
} from '../controllers/prescription.controller.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { validate } from '../middleware/validate.js';
import {
  createPrescriptionSchema,
  listEmrQuerySchema,
  updatePrescriptionSchema,
} from '../validators/emr.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('prescriptions', 'read'), validate(listEmrQuerySchema, 'query'), listPrescriptions);
router.post('/', protect, checkPermission('prescriptions', 'create'), validate(createPrescriptionSchema), createPrescription);
router.get('/:rxId', protect, checkPermission('prescriptions', 'read'), getPrescription);
router.patch('/:rxId', protect, checkPermission('prescriptions', 'update'), validate(updatePrescriptionSchema), updatePrescription);
router.delete('/:rxId', protect, checkPermission('prescriptions', 'delete'), deletePrescription);

export default router;