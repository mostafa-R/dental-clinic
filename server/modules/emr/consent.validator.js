import { z } from 'zod';

import { CONSENT_STATUSES, CONSENT_TYPES, SIGNATURE_METHODS } from './consent.model.js';

const objectId = z.string().length(24, 'Invalid id');
const dateOrEmpty = z.string().datetime({ message: 'Invalid date' }).optional().or(z.literal(''));

export const createConsentSchema = z.object({
  type: z.enum(CONSENT_TYPES),
  title: z.string().min(1, 'Title is required').max(200),
  summary: z.string().max(1000).optional(),
  termsText: z.string().max(20000).optional(),
  treatmentPlan: objectId.optional(),
  attachmentUrl: z.string().max(1024).optional(),
  expiresAt: dateOrEmpty,
});

export const updateConsentSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    summary: z.string().max(1000).optional(),
    termsText: z.string().max(20000).optional(),
    treatmentPlan: objectId.nullable().optional(),
    attachmentUrl: z.string().max(1024).optional(),
    expiresAt: dateOrEmpty,
    status: z.enum(['draft', 'sent']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

/**
 * Sign — records the patient's e-signature. `otp` requires a delivery phone
 * AND the code that was SMS/WhatsApp-delivered and verified server-side
 * (audit M2: previously any name + phone passed as an "OTP signature" without
 * a code ever being checked — staff could sign as the patient with a phone
 * number alone).
 */
export const signConsentSchema = z
  .object({
    signature: z.object({
      method: z.enum(SIGNATURE_METHODS),
      name: z.string().min(1, 'Signer name is required').max(120),
      phone: z.string().max(30).optional(),
      imageUrl: z.string().max(1024).optional(),
    }),
    // Auto-verified: the 6-digit code issued by `POST .../send-otp`, consumed
    // once. Required only for `otp` signatures.
    otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits').optional(),
    patientStatement: z.string().max(1000).optional(),
  })
  .refine((data) => {
    if (data.signature?.method === 'otp' && !data.signature?.phone) {
      return false;
    }
    return true;
  }, { message: 'OTP signatures require a phone number', path: ['signature', 'phone'] })
  .refine((data) => {
    if (data.signature?.method === 'otp' && !data.otp) {
      return false;
    }
    return true;
  }, { message: 'OTP signatures require the verification code (request one via send-otp first)', path: ['otp'] });

export const declineConsentSchema = z.object({
  reason: z.string().min(3, 'Reason is required').max(500),
});

export const withdrawConsentSchema = z.object({
  reason: z.string().min(3, 'Reason is required').max(500),
});

export const listConsentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(CONSENT_STATUSES).optional(),
  type: z.enum(CONSENT_TYPES).optional(),
});