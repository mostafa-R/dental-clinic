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
  notes: z.string().max(500).optional(),
});

export const createTreatmentPlanSchema = z.object({
  title: z.string().min(1, 'Title is required').max(120),
  doctor: objectId,
  diagnosis: z.string().max(1000).optional(),
  items: z.array(treatmentItemSchema).min(1, 'At least one item is required').max(100),
  nextAppointment: dateOrEmpty,
  nextAppointmentNotes: z.string().max(500).optional(),
}).strip();

export const updateTreatmentPlanSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    doctor: objectId.optional(),
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

// L6: URLs are service paths (/api/...) or https — arbitrary/javascript:/
// data: schemes are rejected to stop script-injection attachment links.
const attachmentUrl = z
  .string()
  .min(1, 'Attachment URL is required')
  .max(1024)
  .refine(
    (u) => u.startsWith('/api/') || /^https:\/\//i.test(u),
    { message: 'Attachment URL must be a local /api/ path or an https:// link' },
  );

// New attachments (created inline within a note) always require a URL.
const attachmentSchema = z.object({
  _id: objectId.optional(),
  type: z.enum(ATTACHMENT_TYPES).optional(),
  url: attachmentUrl,
  caption: z.string().max(200).optional(),
});

// Update path is an upsert: entries carrying an existing subdoc _id only patch
// that attachment (caption/type) and must not be forced to supply a URL, while
// brand-new entries still need a valid URL.
const attachmentUpsertSchema = z
  .object({
    _id: objectId.optional(),
    type: z.enum(ATTACHMENT_TYPES).optional(),
    url: attachmentUrl.optional(),
    caption: z.string().max(200).optional(),
  })
  .superRefine((a, ctx) => {
    if (!a._id && !a.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'Attachment URL is required',
      });
    }
  });

export const createClinicalNoteSchema = z.object({
  doctor: objectId,
  appointment: objectId.optional(),
  visitDate: dateOrEmpty,
  // PRD §6.5: SOAP fields are mandatory on creation (partial updates allowed).
  chiefComplaint: z.string().min(1, 'Chief complaint is required').max(1000),
  examination: z.string().min(1, 'Examination is required').max(2000),
  diagnosis: z.string().min(1, 'Diagnosis is required').max(1000),
  plan: z.string().min(1, 'Plan is required').max(2000),
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
    attachments: z.array(attachmentUpsertSchema).max(20).optional(),
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
