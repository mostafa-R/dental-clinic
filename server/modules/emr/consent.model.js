import mongoose from 'mongoose';

/**
 * Consent types (PRD §9.2 / §25.4 — domain 2: consents).
 * 'treatment' documents a treatment-plan approval; 'imaging'/'anesthesia' are
 * procedure-specific; 'financial' covers installment/payment agreements;
 * 'general' covers clinic-wide policies and electronic communication.
 */
export const CONSENT_TYPES = [
  'treatment',
  'imaging',
  'anesthesia',
  'financial',
  'general',
  'electronic_communication',
];

/**
 * Lifecycle (immutable after signature):
 *   draft → sent → signed | declined | withdrawn | expired
 * `sent` means the form was shown to the patient; only draft/sent records can
 * still be edited or voided (soft delete). Once `signed` the record is frozen.
 */
export const CONSENT_STATUSES = [
  'draft',
  'sent',
  'signed',
  'declined',
  'withdrawn',
  'expired',
];

export const SIGNATURE_METHODS = ['typed', 'drawn', 'otp', 'staff_photo', 'patient_photo'];

/**
 * E-signature sub-document. `hash` is an HMAC-SHA256 binding the immutable
 * record fields + timestamp + signer name, so a signed consent is tamper
 * evident without a third-party provider (PRD: خدمة توقيع محلية E-signature).
 */
const signatureSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: SIGNATURE_METHODS,
      default: 'typed',
    },
    name: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: '',
    },
    ip: {
      type: String,
      trim: true,
      maxlength: 64,
      default: '',
    },
    signedAt: {
      type: Date,
      default: null,
    },
    signedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 1024,
      default: '',
    },
    hash: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false },
);

const consentSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: CONSENT_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    summary: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    patientStatement: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    termsText: {
      type: String,
      trim: true,
      maxlength: 20000,
      default: '',
    },
    treatmentPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreatmentPlan',
      default: null,
    },
    attachmentUrl: {
      type: String,
      trim: true,
      maxlength: 1024,
      default: '',
    },
    version: {
      type: Number,
      min: 1,
      default: 1,
    },
    status: {
      type: String,
      enum: CONSENT_STATUSES,
      default: 'draft',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    signature: {
      type: signatureSchema,
      default: () => ({}),
    },
    declineReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    withdrawReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// One active version per (patient, type). New versions get a higher `version`.
consentSchema.index({ patient: 1, type: 1, version: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
consentSchema.index({ branch: 1, patient: 1, createdAt: -1 });
consentSchema.index({ patient: 1, status: 1 });

consentSchema.set('toJSON', { virtuals: true });
consentSchema.set('toObject', { virtuals: true });

const Consent = mongoose.model('Consent', consentSchema);

export default Consent;