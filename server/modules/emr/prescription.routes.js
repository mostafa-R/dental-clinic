import { Router } from 'express';

import {
  createPrescription,
  deletePrescription,
  getPrescription,
  listPrescriptions,
  updatePrescription,
} from './prescription.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createPrescriptionSchema,
  listEmrQuerySchema,
  updatePrescriptionSchema,
} from './emr.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('prescriptions', 'read'), phiRestrict, validate(listEmrQuerySchema, 'query'), listPrescriptions);
router.post('/', protect, checkPermission('prescriptions', 'create'), phiRestrict, validate(createPrescriptionSchema), createPrescription);
router.get('/:rxId', protect, checkPermission('prescriptions', 'read'), phiRestrict, getPrescription);
router.patch('/:rxId', protect, checkPermission('prescriptions', 'update'), phiRestrict, validate(updatePrescriptionSchema), updatePrescription);
router.delete('/:rxId', protect, checkPermission('prescriptions', 'delete'), phiRestrict, deletePrescription);

export default router;
