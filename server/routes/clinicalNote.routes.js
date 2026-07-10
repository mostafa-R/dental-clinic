import { Router } from 'express';

import {
  createClinicalNote,
  deleteClinicalNote,
  getClinicalNote,
  listClinicalNotes,
  updateClinicalNote,
} from '../controllers/clinicalNote.controller.js';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { validate } from '../middleware/validate.js';
import {
  createClinicalNoteSchema,
  listEmrQuerySchema,
  updateClinicalNoteSchema,
} from '../validators/emr.validator.js';

const router = Router({ mergeParams: true });

router.get('/', protect, checkPermission('emr', 'read'), validate(listEmrQuerySchema, 'query'), listClinicalNotes);
router.post('/', protect, checkPermission('emr', 'create'), validate(createClinicalNoteSchema), createClinicalNote);
router.get('/:noteId', protect, checkPermission('emr', 'read'), getClinicalNote);
router.patch('/:noteId', protect, checkPermission('emr', 'update'), validate(updateClinicalNoteSchema), updateClinicalNote);
router.delete('/:noteId', protect, checkPermission('emr', 'delete'), deleteClinicalNote);

export default router;