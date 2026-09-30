import { z } from 'zod';

const conditionSchema = z.object({
  name: z.string().min(1, 'Condition name is required').max(120),
  notes: z.string().max(500).optional(),
});

const medicalHistorySchema = z.object({
  chronicConditions: z.array(conditionSchema).max(50).optional(),
  allergies: z.array(conditionSchema).max(50).optional(),
  notes: z.string().max(2000).optional(),
});

const phoneSchema = z
  .string()
  .min(4, 'Phone number is required')
  .max(30, 'Phone number is too long')
  .regex(/^[+\d][\d\s-]*$/, 'Phone number may contain digits, spaces, + and -');

export const createPatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(60),
  lastName: z.string().min(1, 'Last name is required').max(60),
  phone: phoneSchema,
  email: z.string().email('Invalid email address').max(120).optional().or(z.literal('')),
  dateOfBirth: z
    .string()
    .datetime({ message: 'Invalid date of birth' })
    .optional()
    .or(z.literal('')),
  gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
  address: z.string().max(300).optional(),
  medicalHistory: medicalHistorySchema.optional(),
  isActive: z.boolean().optional(),
  branch: z.string().length(24, 'Invalid branch id').optional(),
});

export const updatePatientSchema = z
  .object({
    firstName: z.string().min(1).max(60).optional(),
    lastName: z.string().min(1).max(60).optional(),
    phone: phoneSchema.optional(),
    email: z.string().email('Invalid email address').max(120).optional().or(z.literal('')),
    dateOfBirth: z
      .string()
      .datetime({ message: 'Invalid date of birth' })
      .optional()
      .or(z.literal('')),
    gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
    address: z.string().max(300).optional(),
    medicalHistory: medicalHistorySchema.optional(),
    isActive: z.boolean().optional(),
    branch: z.string().length(24, 'Invalid branch id').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

export const listPatientsQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z.enum(['true', 'false']).optional(),
});

export const mergePatientSchema = z.object({
  duplicateOf: z.string().length(24, 'Invalid patient id'),
});

/**
 * Batch form of the above. Merging a duplicate group is one operator decision,
 * so it is one request and one transaction: if the third pair is invalid the
 * first two must not be left committed.
 *
 * The refinement rejects the shapes that are ambiguous rather than merely
 * unusual - in particular a chain (A into B, B into C) or a record that is
 * both merged away and merged into within the same batch, where the outcome
 * would depend on the order the pairs happen to be processed in.
 */
export const mergePatientsBatchSchema = z
  .object({
    merges: z
      .array(
        z.object({
          duplicateId: z.string().length(24, 'Invalid patient id'),
          survivorId: z.string().length(24, 'Invalid patient id'),
        }),
      )
      .min(1, 'At least one merge is required')
      .max(50, 'Too many merges in one request'),
  })
  .superRefine(({ merges }, ctx) => {
    const survivors = new Set();
    const duplicates = new Set();

    merges.forEach((pair, index) => {
      if (pair.duplicateId === pair.survivorId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['merges', index, 'survivorId'],
          message: 'A patient cannot be merged into itself',
        });
      }
      if (duplicates.has(pair.duplicateId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['merges', index, 'duplicateId'],
          message: 'Duplicate record appears more than once in this batch',
        });
      }
      if (survivors.has(pair.duplicateId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['merges', index, 'duplicateId'],
          message: 'Record is merged away and merged into within the same batch',
        });
      }
      duplicates.add(pair.duplicateId);
      survivors.add(pair.survivorId);
    });
  });
