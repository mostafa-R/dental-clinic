import { z } from 'zod';

import { RECALL_PRIORITIES, RECALL_STATUSES, RECALL_TYPES } from './recall.model.js';

const objectId = z.string().length(24, 'Invalid id');
const optionalId = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  objectId.optional(),
);
const dateTime = z.string().datetime({ message: 'Invalid date' });
const dateOrDateTime = z.union([dateTime, z.coerce.date()]);

export const createRecallSchema = z.object({
  branch: objectId.optional(),
  patient: objectId,
  sourceAppointment: optionalId,
  sourceTreatmentPlan: optionalId,
  recallType: z.enum(RECALL_TYPES).optional(),
  reason: z.string().max(500).optional(),
  dueDate: dateOrDateTime,
  priority: z.enum(RECALL_PRIORITIES).optional(),
  assignedTo: optionalId,
  notes: z.string().max(2000).optional(),
}).strip();

export const listRecallsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(RECALL_STATUSES).optional(),
  recallType: z.enum(RECALL_TYPES).optional(),
  branch: optionalId,
  assignedTo: optionalId,
  dueFrom: z.string().datetime({ message: 'Invalid dueFrom' }).optional(),
  dueTo: z.string().datetime({ message: 'Invalid dueTo' }).optional(),
  patient: z.string().min(1).max(120).optional(),
});

export const updateRecallSchema = z.object({
  reason: z.string().max(500).optional(),
  priority: z.enum(RECALL_PRIORITIES).optional(),
  notes: z.string().max(2000).optional(),
  outcome: z.string().max(500).optional(),
  assignedTo: z.string().max(24).nullable().optional(),
  dueDate: dateOrDateTime.optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'No fields provided to update',
});

export const contactRecallSchema = z.object({
  notes: z.string().max(2000).optional(),
}).strip();

export const postponeRecallSchema = z.object({
  postponedUntil: dateTime,
  notes: z.string().max(2000).optional(),
});

export const scheduleRecallSchema = z.object({
  appointmentId: objectId,
});

export const outcomeSchema = z.object({
  outcome: z.string().max(500).optional(),
}).strip();
