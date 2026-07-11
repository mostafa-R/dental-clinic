import { Router } from 'express';
import { createUser, deleteUser, getUser, listDoctors, listUsers, toggleUserActive, updateUser } from './user.controller.js';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { createUserSchema } from './user.validator.js';
import { z } from 'zod';

const updateUserSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(['clinic_admin', 'doctor', 'receptionist', 'accountant']).optional(),
  roleId: z.string().length(24).nullable().optional(),
  phone: z.string().max(30).optional(),
  branch: z.string().length(24).nullable().optional(),
  isActive: z.boolean().optional(),
  isDoctor: z.boolean().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
});

const listUsersQuerySchema = z.object({
  role: z.string().optional(),
  isDoctor: z.enum(['true', 'false']).optional(),
  branch: z.string().length(24).optional(),
});

const router = Router();

router.get('/', protect, checkPermission('users', 'read'), validate(listUsersQuerySchema, 'query'), listUsers);
router.get('/doctors', protect, listDoctors);
router.get('/:id', protect, checkPermission('users', 'read'), getUser);
router.post('/', protect, checkPermission('users', 'create'), validate(createUserSchema), createUser);
router.patch('/:id', protect, checkPermission('users', 'update'), validate(updateUserSchema), updateUser);
router.delete('/:id', protect, checkPermission('users', 'delete'), deleteUser);
router.patch('/:id/toggle-active', protect, checkPermission('users', 'update'), toggleUserActive);

export default router;
