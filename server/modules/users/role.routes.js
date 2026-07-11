import { Router } from 'express';

import {
  createRole,
  deleteRole,
  getModules,
  getRole,
  listRoles,
  updateRole,
} from './role.controller.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createRoleSchema,
  listRolesQuerySchema,
  updateRoleSchema,
} from './role.validator.js';

const router = Router();

// All routes require authentication. Only super_admin (via the 'roles' module
// permission) can manage roles. For backwards compatibility, the built-in
// super_admin role always passes — checkPermission resolves it as isSystemAdmin.
router.get('/modules/list', protect, checkPermission('roles', 'read'), getModules);
router.get('/', protect, checkPermission('roles', 'read'), listRoles);
router.get('/:id', protect, checkPermission('roles', 'read'), getRole);
router.post('/', protect, checkPermission('roles', 'create'), validate(createRoleSchema), createRole);
router.patch('/:id', protect, checkPermission('roles', 'update'), validate(updateRoleSchema), updateRole);
router.delete('/:id', protect, checkPermission('roles', 'delete'), deleteRole);

export default router;
