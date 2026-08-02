import { Router } from 'express';

import {
  archivePatient,
  createPatient,
  getPatient,
  listPatients,
  updatePatient,
} from './patient.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createPatientSchema,
  listPatientsQuerySchema,
  updatePatientSchema,
} from './patient.validator.js';

const router = Router();

router.get('/', protect, checkPermission('patients', 'read'), phiRestrict, validate(listPatientsQuerySchema, 'query'), listPatients);
router.get('/:id', protect, checkPermission('patients', 'read'), phiRestrict, getPatient);
router.post('/', protect, checkPermission('patients', 'create'), phiRestrict, validate(createPatientSchema), createPatient);
router.patch('/:id', protect, checkPermission('patients', 'update'), phiRestrict, validate(updatePatientSchema), updatePatient);
router.delete('/:id', protect, checkPermission('patients', 'delete'), phiRestrict, archivePatient);

export default router;
