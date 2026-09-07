import { z } from 'zod';
import { passwordSchema } from '../../utils/passwordSchema.js';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
});

export const preferencesSchema = z
  .object({
    language: z.enum(['en', 'ar']).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  })
  .refine((data) => data.language !== undefined || data.theme !== undefined, {
    message: 'Provide a language or theme to update',
  });
