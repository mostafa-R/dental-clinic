import { z } from 'zod';

import { CRUD_ACTIONS, MODULE_KEYS } from '../../constants/permissions.js';

const objectId = z.string().length(24, 'Invalid id');

const permissionEntrySchema = z.object({
  module: z.enum(MODULE_KEYS),
  actions: z.array(z.enum(CRUD_ACTIONS)).max(4),
});

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').max(60),
  description: z.string().max(300).optional(),
  permissions: z.array(permissionEntrySchema).max(20),
});

export const updateRoleSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(300).optional(),
    permissions: z.array(permissionEntrySchema).max(20).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

export const listRolesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
