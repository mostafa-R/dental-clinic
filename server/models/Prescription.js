import mongoose from 'mongoose';

import Counter from './Counter.js';

const medicationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    dosage: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    frequency: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    duration: {
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
  },
  { _id: true },
);

const prescriptionSchema = new mongoose.Schema(
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
    rxNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    diagnosis: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    medications: {
      type: [medicationSchema],
      validate: [
        (v) => Array.isArray(v) && v.length > 0,
        'At least one medication is required',
      ],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    issuedAt: {
      type: Date,
      default: () => new Date(),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

prescriptionSchema.pre('validate', async function assignRxNo() {
  if (!this.rxNo) {
    const nextSeq = await Counter.next('prescription', this.tenant);
    this.rxNo = `RX-${String(nextSeq).padStart(5, '0')}`;
  }
});

prescriptionSchema.virtual('medicationCount').get(function medicationCount() {
  return (this.medications || []).length;
});

prescriptionSchema.set('toJSON', { virtuals: true });
prescriptionSchema.set('toObject', { virtuals: true });

prescriptionSchema.index({ branch: 1, patient: 1, issuedAt: -1 });
prescriptionSchema.index({ branch: 1, createdAt: -1 });

const Prescription = mongoose.model('Prescription', prescriptionSchema);

export default Prescription;
