import { z } from 'zod';

import { APPOINTMENT_STATUS } from './appointment.model.js';

const objectIdSchema = z.string().length(24, 'Invalid id');

const dateTimeSchema = z
  .string()
  .min(1, 'Date/time is required')
  .refine((val) => !Number.isNaN(Date.parse(val)), {
    message: 'Invalid date/time',
  });

/** Coerce empty strings to undefined so omitted query params validate cleanly. */
const optionalParam = (schema) =>
  z.preprocess((val) => (val === '' || val === null ? undefined : val), schema.optional());

export const createAppointmentSchema = z
  .object({
    patient: objectIdSchema,
    doctor: objectIdSchema,
    branch: objectIdSchema.optional(),
    chair: z.string().max(60).optional(),
    start: dateTimeSchema.optional(),
    end: dateTimeSchema.optional(),
    // PRD §6.4: when `end` is omitted the duration is slotDuration × slots.
    slots: z.number().int().min(1).max(3, 'Slots can be extended up to ×3').optional(),
    status: z.enum(['scheduled', 'confirmed']).optional(),
    reason: z.string().max(300).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.start && data.end) return new Date(data.end) > new Date(data.start);
      return true;
    },
    { message: 'End time must be after start time', path: ['end'] },
  );

export const updateAppointmentSchema = z
  .object({
    patient: objectIdSchema.optional(),
    doctor: objectIdSchema.optional(),
    branch: objectIdSchema.optional(),
    chair: z.string().max(60).optional(),
    start: dateTimeSchema.optional(),
    end: dateTimeSchema.optional(),
    slots: z.number().int().min(1).max(3, 'Slots can be extended up to ×3').optional(),
    reason: z.string().max(300).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine(
    (data) => {
      if (data.start && data.end) return new Date(data.end) > new Date(data.start);
      return true;
    },
    { message: 'End time must be after start time', path: ['end'] },
  )
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

export const transitionSchema = z.object({
  status: z.enum(APPOINTMENT_STATUS),
});

export const callNextSchema = z.object({
  doctor: objectIdSchema.optional(),
});

export const listAppointmentsQuerySchema = z.object({
  from: optionalParam(z.coerce.date()),
  to: optionalParam(z.coerce.date()),
  date: optionalParam(z.string()),
  doctor: optionalParam(objectIdSchema),
  patient: optionalParam(z.string()),
  status: optionalParam(z.enum(APPOINTMENT_STATUS)),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
