import { z } from 'zod';

import {
  COMMISSION_STATUS,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
} from '../../constants/accounting.js';

const objectId = z.string().length(24, 'Invalid id');

/* ------------------------------------------------------------------ Expense */

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(1, 'Description is required').max(300),
  amount: z.number().min(0.01, 'Amount must be positive'),
  date: z.string().datetime({ message: 'Invalid date' }).optional().or(z.literal('')),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).optional(),
  branch: z.string().length(24, 'Invalid branch id').optional(),
}).refine((data) => data.paymentMethod !== 'wallet', {
  message: 'Expenses cannot be paid from a patient wallet',
  path: ['paymentMethod'],
});

export const listExpenseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/* ------------------------------------------------------------ Owner drawing */

export const createDrawingSchema = z.object({
  owner: objectId,
  amount: z.number().min(0.01, 'Amount must be positive'),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS).optional(),
  patient: objectId.optional(),
  description: z.string().max(300).optional(),
  date: z.string().datetime({ message: 'Invalid date' }).optional().or(z.literal('')),
  branch: z.string().length(24, 'Invalid branch id').optional(),
});

export const listDrawingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/* ------------------------------------------------------------- Commission */

export const listCommissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  doctor: objectId.optional(),
  status: z.enum(COMMISSION_STATUS).optional(),
});

export const payCommissionSchema = z.object({
  status: z.literal('paid'),
});

/* ---------------------------------------------- Treatment plan → invoice */

export const generateInvoiceSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1, 'Select at least one item').max(100),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

/* ---------------------------------------------------------- Accounting query */

export const accountingSummaryQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/* ---------------------------------------------------------------- Day Close */

export const dayCloseQuerySchema = z.object({
  date: z.string().min(4).max(40).optional(),
  branch: objectId.optional(),
});

export const closeDaySchema = z.object({
  date: z.string().min(4).max(40).optional(),
  branch: objectId.optional(),
  countedCash: z.number().min(0, 'Counted cash cannot be negative'),
  notes: z.string().max(500).optional(),
});

export const listDayCloseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  from: z.string().min(4).max(40).optional(),
  to: z.string().min(4).max(40).optional(),
});
