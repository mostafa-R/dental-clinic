import { z } from 'zod';

import { INSTALLMENT_STATUS, INSTALLMENT_PLAN_STATUS, INSTALLMENT_FREQUENCIES, WALLET_TX_TYPES } from '../../constants/wallet.js';

// Strict ObjectId check: a 24-char string is not enough — it must also be
// valid hexadecimal so typos/dirty ids are rejected before they hit Mongo.
const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createInstallmentPlanSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  totalAmount: z.number().positive('Total amount must be positive'),
  installments: z
    .array(
      z.object({
        dueDate: z.string().datetime({ message: 'Invalid due date' }),
        amount: z.number().positive('Installment amount must be positive'),
      }),
    )
    .min(1, 'At least one installment is required')
    .max(60, 'Maximum 60 installments'),
  frequency: z.enum(INSTALLMENT_FREQUENCIES).optional(),
  invoice: objectId.optional(),
  notes: z.string().max(1000).optional(),
});

export const payInstallmentSchema = z.object({
  installmentId: objectId,
  amount: z.number().positive('Payment amount must be positive'),
  // PRD §6.3: an overdue installment can be settled with an optional late fee.
  lateFee: z.number().min(0, 'Late fee cannot be negative').optional(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'wallet']).optional(),
  paymentRef: z.string().max(100).optional(),
  notes: z.string().max(300).optional(),
}).superRefine((data, ctx) => {
  // Traceability (L6): card and transfer payments need an external
  // transaction reference; cash and wallet are the internal rails.
  const method = data.paymentMethod || 'cash';
  if ((method === 'card' || method === 'transfer') && !(data.paymentRef && data.paymentRef.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['paymentRef'],
      message: 'paymentRef is required for card/transfer payments',
    });
  }
});

export const updateInstallmentPlanSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(INSTALLMENT_PLAN_STATUS).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: 'No fields provided' });

export const listInstallmentPlansSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(INSTALLMENT_PLAN_STATUS).optional(),
});

export const addWalletTransactionSchema = z.object({
  type: z.enum(WALLET_TX_TYPES),
  amount: z.number().positive('Amount must be positive'),
  reference: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
  invoice: objectId.optional(),
  installment: objectId.optional(),
}).refine((data) => {
  // A manual wallet debit must be traceable to something — a linked
  // invoice/installment or an explicit reference — otherwise it becomes a
  // silent ledger entry that reconciles to nothing.
  if (data.type === 'debit') {
    return Boolean(data.invoice || data.installment || (data.reference && data.reference.trim()));
  }
  return true;
}, {
  message: 'A wallet debit must reference an invoice, installment, or carry a reference',
  path: ['reference'],
});
