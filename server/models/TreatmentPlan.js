import mongoose from 'mongoose';

import Counter from './Counter.js';
import { round2 } from '../constants/accounting.js';
import {
  PLAN_STATUSES,
  PROCEDURE_STATUSES,
  SURFACE_CONDITIONS,
  SURFACES,
} from '../constants/dental.js';

const treatmentItemSchema = new mongoose.Schema(
  {
    tooth: {
      // Universal number 1-32, null for whole-mouth / non-tooth procedures.
      type: Number,
      min: 1,
      max: 32,
      default: null,
    },
    surfaces: {
      type: [String],
      enum: SURFACES,
      default: [],
    },
    procedureCode: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    procedureName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    estimatedCost: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: PROCEDURE_STATUSES,
      default: 'pending',
    },
    completedDate: {
      type: Date,
      default: null,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { _id: true },
);

const treatmentPlanSchema = new mongoose.Schema(
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
    planNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    diagnosis: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    status: {
      type: String,
      enum: PLAN_STATUSES,
      default: 'active',
      index: true,
    },
    items: {
      type: [treatmentItemSchema],
      validate: [
        (v) => Array.isArray(v) && v.length > 0,
        'At least one treatment item is required',
      ],
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
  },
  { timestamps: true },
);

treatmentPlanSchema.pre('validate', async function assignPlanNo() {
  if (!this.planNo) {
    const nextSeq = await Counter.next('treatment_plan', this.tenant);
    this.planNo = `TP-${String(nextSeq).padStart(5, '0')}`;
  }
});

treatmentPlanSchema.virtual('totalEstimated').get(function totalEstimated() {
  return round2(
    (this.items || []).reduce((sum, it) => sum + (Number(it.estimatedCost) || 0), 0),
  );
});

treatmentPlanSchema.virtual('totalCompleted').get(function totalCompleted() {
  return round2(
    (this.items || [])
      .filter((it) => it.status === 'completed')
      .reduce((sum, it) => sum + (Number(it.estimatedCost) || 0), 0),
  );
});

treatmentPlanSchema.virtual('completedCount').get(function completedCount() {
  return (this.items || []).filter((it) => it.status === 'completed').length;
});

treatmentPlanSchema.virtual('progress').get(function progress() {
  const items = this.items || [];
  if (items.length === 0) return 0;
  return Math.round((this.completedCount / items.length) * 100);
});

treatmentPlanSchema.set('toJSON', { virtuals: true });
treatmentPlanSchema.set('toObject', { virtuals: true });

treatmentPlanSchema.index({ branch: 1, patient: 1, status: 1 });
treatmentPlanSchema.index({ branch: 1, createdAt: -1 });

// Re-export surface condition enum for validators that import from the model.
export { SURFACE_CONDITIONS };

const TreatmentPlan = mongoose.model('TreatmentPlan', treatmentPlanSchema);

export default TreatmentPlan;
