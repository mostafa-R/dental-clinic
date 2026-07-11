import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const preferencesSchema = z
  .object({
    language: z.enum(['en', 'ar']).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  })
  .refine((data) => data.language !== undefined || data.theme !== undefined, {
    message: 'Provide a language or theme to update',
  });
