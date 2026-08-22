import { z } from 'zod';

export const objectIdStr = z.string().length(24, 'Invalid id');

const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(60)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, dashes, and underscores');

export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().email('Invalid email address'),
  // PRD §6.1: optional username usable for login instead of the email.
  username: usernameSchema.optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  roleId: objectIdStr,
  phone: z.string().max(30).optional(),
  branch: objectIdStr.optional(),
  isActive: z.boolean().optional(),
  isDoctor: z.boolean().optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    email: z.string().email().optional(),
    username: usernameSchema.nullable().optional(),
    phone: z.string().max(30).optional(),
    branch: z.string().length(24).nullable().optional(),
    roleId: objectIdStr.optional(),
    isActive: z.boolean().optional(),
    isDoctor: z.boolean().optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });
