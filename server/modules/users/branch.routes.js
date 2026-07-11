import { Router } from 'express';
import { createBranch, deleteBranch, listBranches, updateBranch } from './branch.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { createBranchSchema, updateBranchSchema } from './branch.validator.js';

const router = Router();

router.get('/', protect, checkPermission('branches', 'read'), listBranches);
router.post('/', protect, checkPermission('branches', 'create'), validate(createBranchSchema), createBranch);
router.patch('/:id', protect, checkPermission('branches', 'update'), validate(updateBranchSchema), updateBranch);
router.delete('/:id', protect, checkPermission('branches', 'delete'), deleteBranch);

export default router;
