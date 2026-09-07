import { z } from 'zod';

/**
 * Shared password validation with complexity requirements.
 *
 * Requirements:
 *  - 8–128 characters
 *  - at least one uppercase letter
 *  - at least one lowercase letter
 *  - at least one digit
 *  - at least one special character (non-alphanumeric)
 *
 * Imported by every create/login/password-change validator so the policy is
 * enforced consistently across the system.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/** Optional variant for update flows where the password field is optional. */
export const optionalPasswordSchema = passwordSchema.optional();

export default passwordSchema;
