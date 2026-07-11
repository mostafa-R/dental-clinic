import mongoose from 'mongoose';

import Counter from '../../core/counters.js';
import { ATTACHMENT_TYPES } from '../../constants/dental.js';

const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ATTACHMENT_TYPES,
      default: 'xray',
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1024,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: true },
);

const clinicalNoteSchema = new mongoose.Schema(
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
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true,
    },
    noteNo: {
      type: String,
      required: true,
      index: true,
    },
    visitDate: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    // SOAP structure: subjective / objective / assessment / plan.
    chiefComplaint: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    examination: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    diagnosis: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    plan: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    nextAppointment: {
      type: Date,
      default: null,
    },
    nextAppointmentNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    nextAppointmentCreated: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

clinicalNoteSchema.pre('validate', async function assignNoteNo() {
  if (!this.noteNo) {
    const nextSeq = await Counter.next('clinical_note', this.tenant);
    this.noteNo = `CN-${String(nextSeq).padStart(5, '0')}`;
  }
});

clinicalNoteSchema.virtual('attachmentCount').get(function attachmentCount() {
  return (this.attachments || []).length;
});

clinicalNoteSchema.set('toJSON', { virtuals: true });
clinicalNoteSchema.set('toObject', { virtuals: true });

clinicalNoteSchema.index({ tenant: 1, noteNo: 1 }, { unique: true });
clinicalNoteSchema.index({ branch: 1, patient: 1, visitDate: -1 });
clinicalNoteSchema.index({ branch: 1, createdAt: -1 });

const ClinicalNote = mongoose.model('ClinicalNote', clinicalNoteSchema);

export default ClinicalNote;
