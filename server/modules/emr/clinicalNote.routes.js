import { Router } from 'express';

import {
  createClinicalNote,
  deleteClinicalNote,
  getClinicalNote,
  listClinicalNotes,
  updateClinicalNote,
} from './clinicalNote.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { validate } from '../../middleware/validate.js';
import {
  createClinicalNoteSchema,
  listEmrQuerySchema,
  updateClinicalNoteSchema,
} from './emr.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('emr', 'read'), phiRestrict, validate(listEmrQuerySchema, 'query'), listClinicalNotes);
router.post('/', protect, checkPermission('emr', 'create'), phiRestrict, validate(createClinicalNoteSchema), createClinicalNote);
router.get('/:noteId', protect, checkPermission('emr', 'read'), phiRestrict, getClinicalNote);
router.patch('/:noteId', protect, checkPermission('emr', 'update'), phiRestrict, validate(updateClinicalNoteSchema), updateClinicalNote);
router.delete('/:noteId', protect, checkPermission('emr', 'delete'), phiRestrict, deleteClinicalNote);

export default router;
