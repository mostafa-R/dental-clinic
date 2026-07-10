import { z } from 'zod';

import { INVOICE_STATUS, PAYMENT_METHODS } from '../models/Invoice.js';

const objectIdSchema = z.string().length(24, 'Invalid id');

/** Coerce empty strings to undefined so omitted query params validate cleanly. */
const optionalParam = (schema) =>
  z.preprocess((val) => (val === '' || val === null ? undefined : val), schema.optional());

const itemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(200),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be 0 or greater'),
  discount: z.coerce.number().min(0).optional(),
  tax: z.coerce.number().min(0).optional(),
});

export const createInvoiceSchema = z.object({
  patient: objectIdSchema,
  branch: objectIdSchema.optional(),
  appointment: objectIdSchema.optional(),
  items: z.array(itemSchema).min(1, 'At least one line item is required'),
  discount: z.coerce.number().min(0).optional(),
  discountType: z.enum(['fixed', 'percentage']).optional(),
  discountRate: z.coerce.number().min(0).max(100).optional(),
  tax: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  dueDate: z.string().datetime({ message: 'Invalid due date' }).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateInvoiceSchema = z
  .object({
    items: z.array(itemSchema).min(1, 'At least one line item is required').optional(),
    discount: z.coerce.number().min(0).optional(),
    discountType: z.enum(['fixed', 'percentage']).optional(),
    discountRate: z.coerce.number().min(0).max(100).optional(),
    tax: z.coerce.number().min(0).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    dueDate: z.string().datetime({ message: 'Invalid due date' }).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

export const paymentSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(200).optional(),
  date: z.string().datetime({ message: 'Invalid payment date' }).optional(),
  notes: z.string().max(300).optional(),
});

export const refundSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  method: z.enum(PAYMENT_METHODS).optional(),
  reference: z.string().max(200).optional(),
  date: z.string().datetime({ message: 'Invalid payment date' }).optional(),
  notes: z.string().max(300).optional(),
});

export const listInvoicesQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(INVOICE_STATUS).optional(),
  patient: optionalParam(objectIdSchema),
  appointment: optionalParam(objectIdSchema),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
