import { z } from 'zod';

export const objectIdStr = z.string().length(24, 'Invalid id');

export const createUserSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(80),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    role: z.string().min(1, 'Role is required'),
    roleId: objectIdStr.optional(),
    phone: z.string().max(30).optional(),
    branch: objectIdStr.optional(),
    isActive: z.boolean().optional(),
    isDoctor: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== 'site_admin' && !data.branch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['branch'],
        message: 'branch is required for non-site_admin roles',
      });
    }
  });
