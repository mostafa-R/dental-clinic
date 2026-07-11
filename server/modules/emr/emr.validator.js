import { z } from 'zod';

import {
  ATTACHMENT_TYPES,
  DENTITION_TYPES,
  PLAN_STATUSES,
  PROCEDURE_STATUSES,
  SURFACE_CONDITIONS,
  SURFACES,
  TOOTH_STATES,
} from '../../constants/dental.js';

const objectId = z.string().length(24, 'Invalid id');

const dateOrEmpty = z.string().datetime({ message: 'Invalid date' }).optional().or(z.literal(''));

/* ------------------------------------------------------------------ Dental chart */

const surfacesSchema = z
  .object({
    mesial: z.enum(SURFACE_CONDITIONS).optional(),
    distal: z.enum(SURFACE_CONDITIONS).optional(),
    buccal: z.enum(SURFACE_CONDITIONS).optional(),
    lingual: z.enum(SURFACE_CONDITIONS).optional(),
    occlusal: z.enum(SURFACE_CONDITIONS).optional(),
  })
  .optional();

const toothUpdateSchema = z.object({
  number: z.number().int().min(1).max(32),
  state: z.enum(TOOTH_STATES).optional(),
  surfaces: surfacesSchema,
  notes: z.string().max(500).optional(),
});

export const updateDentalChartSchema = z
  .object({
    dentitionType: z.enum(DENTITION_TYPES).optional(),
    notes: z.string().max(2000).optional(),
    teeth: z.array(toothUpdateSchema).max(32).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

export const updateToothSchema = z.object({
  state: z.enum(TOOTH_STATES).optional(),
  surfaces: surfacesSchema,
  notes: z.string().max(500).optional().or(z.literal('')),
});

/* --------------------------------------------------------------- Treatment plan */

const treatmentItemSchema = z.object({
  tooth: z.number().int().min(1).max(32).nullable().optional(),
  surfaces: z.array(z.enum(SURFACES)).max(5).optional(),
  procedureCode: z.string().max(32).optional(),
  procedureName: z.string().min(1, 'Procedure name is required').max(120),
  description: z.string().max(500).optional(),
  estimatedCost: z.number().min(0).default(0),
  status: z.enum(PROCEDURE_STATUSES).optional(),
  appointment: objectId.optional(),
  invoice: objectId.optional(),
  notes: z.string().max(500).optional(),
});

export const createTreatmentPlanSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120),
  diagnosis: z.string().max(1000).optional(),
  status: z.enum(PLAN_STATUSES).optional(),
  items: z.array(treatmentItemSchema).min(1, 'At least one item is required').max(100),
  nextAppointment: dateOrEmpty,
  nextAppointmentNotes: z.string().max(500).optional(),
});

export const updateTreatmentPlanSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    diagnosis: z.string().max(1000).optional(),
    status: z.enum(PLAN_STATUSES).optional(),
    nextAppointment: dateOrEmpty,
    nextAppointmentNotes: z.string().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

export const createTreatmentItemSchema = treatmentItemSchema;

export const updateTreatmentItemSchema = z
  .object({
    tooth: z.number().int().min(1).max(32).nullable().optional(),
    surfaces: z.array(z.enum(SURFACES)).max(5).optional(),
    procedureCode: z.string().max(32).optional(),
    procedureName: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    estimatedCost: z.number().min(0).optional(),
    status: z.enum(PROCEDURE_STATUSES).optional(),
    completedDate: dateOrEmpty,
    appointment: objectId.optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

/* ---------------------------------------------------------------- Prescription */

const medicationSchema = z.object({
  name: z.string().min(1, 'Medication name is required').max(120),
  dosage: z.string().max(60).optional(),
  frequency: z.string().max(60).optional(),
  duration: z.string().max(60).optional(),
  instructions: z.string().max(300).optional(),
});

export const createPrescriptionSchema = z.object({
  doctor: objectId,
  appointment: objectId.optional(),
  diagnosis: z.string().max(500).optional(),
  medications: z.array(medicationSchema).min(1, 'At least one medication is required').max(50),
  notes: z.string().max(1000).optional(),
  issuedAt: dateOrEmpty,
});

export const updatePrescriptionSchema = z
  .object({
    diagnosis: z.string().max(500).optional(),
    notes: z.string().max(1000).optional(),
    medications: z.array(medicationSchema).min(1).max(50).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

/* --------------------------------------------------------------- Clinical note */

const attachmentSchema = z.object({
  type: z.enum(ATTACHMENT_TYPES).optional(),
  url: z.string().min(1, 'Attachment URL is required').max(1024),
  caption: z.string().max(200).optional(),
});

export const createClinicalNoteSchema = z.object({
  doctor: objectId,
  appointment: objectId.optional(),
  visitDate: dateOrEmpty,
  chiefComplaint: z.string().max(1000).optional(),
  examination: z.string().max(2000).optional(),
  diagnosis: z.string().max(1000).optional(),
  plan: z.string().max(2000).optional(),
  attachments: z.array(attachmentSchema).max(20).optional(),
  nextAppointment: dateOrEmpty,
  nextAppointmentNotes: z.string().max(500).optional(),
});

export const updateClinicalNoteSchema = z
  .object({
    visitDate: dateOrEmpty,
    chiefComplaint: z.string().max(1000).optional(),
    examination: z.string().max(2000).optional(),
    diagnosis: z.string().max(1000).optional(),
    plan: z.string().max(2000).optional(),
    attachments: z.array(attachmentSchema).max(20).optional(),
    nextAppointment: dateOrEmpty,
    nextAppointmentNotes: z.string().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields provided to update',
  });

/* ----------------------------------------------------------------- List query */

export const listEmrQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(PLAN_STATUSES).optional(),
  appointment: objectId.optional(),
});
