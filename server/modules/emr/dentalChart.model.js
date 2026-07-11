import mongoose from 'mongoose';

import {
  DENTITION_TYPES,
  SURFACE_CONDITIONS,
  SURFACES,
  TOOTH_STATES,
  defaultTeeth,
} from '../../constants/dental.js';

const surfaceSchema = new mongoose.Schema(
  SURFACES.reduce((acc, surface) => {
    acc[surface] = {
      type: String,
      enum: SURFACE_CONDITIONS,
      default: 'sound',
    };
    return acc;
  }, {}),
  { _id: false },
);

const toothSchema = new mongoose.Schema(
  {
    number: {
      type: Number,
      required: true,
      min: 1,
      max: 32,
    },
    state: {
      type: String,
      enum: TOOTH_STATES,
      default: 'sound',
    },
    surfaces: {
      type: surfaceSchema,
      default: () => ({}),
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    updatedAt: {
      type: Date,
      default: () => new Date(),
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: false },
);

const dentalChartSchema = new mongoose.Schema(
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
      unique: true,
      index: true,
    },
    dentitionType: {
      type: String,
      enum: DENTITION_TYPES,
      default: 'permanent',
    },
    teeth: {
      type: [toothSchema],
      default: defaultTeeth,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

/**
 * Ensure every chart always carries a full 32-tooth array, even if it was
 * created before the default existed or pruned by an older client.
 */
dentalChartSchema.pre('validate', function ensureTeeth() {
  if (!Array.isArray(this.teeth) || this.teeth.length === 0) {
    this.teeth = defaultTeeth();
  }
});

dentalChartSchema.virtual('toothCount').get(function toothCount() {
  return (this.teeth || []).length;
});

dentalChartSchema.virtual('missingCount').get(function missingCount() {
  return (this.teeth || []).filter((t) => t.state === 'missing').length;
});

dentalChartSchema.set('toJSON', { virtuals: true });
dentalChartSchema.set('toObject', { virtuals: true });

dentalChartSchema.index({ branch: 1, patient: 1 }, { unique: true });

const DentalChart = mongoose.model('DentalChart', dentalChartSchema);

export default DentalChart;
