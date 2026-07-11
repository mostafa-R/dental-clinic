import { z } from 'zod';

import { INSTALLMENT_STATUS, INSTALLMENT_PLAN_STATUS, INSTALLMENT_FREQUENCIES, WALLET_TX_TYPES } from '../../constants/wallet.js';

const objectId = z.string().length(24, 'Invalid id');

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
  amount: z.number().positive('Payment amount must be positive'),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'wallet']).optional(),
  paymentRef: z.string().max(100).optional(),
  notes: z.string().max(300).optional(),
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

export const listWalletTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const addWalletTransactionSchema = z.object({
  type: z.enum(WALLET_TX_TYPES),
  amount: z.number().positive('Amount must be positive'),
  reference: z.string().max(100).optional(),
  description: z.string().max(300).optional(),
  invoice: objectId.optional(),
  installment: objectId.optional(),
});
