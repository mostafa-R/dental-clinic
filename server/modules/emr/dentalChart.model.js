import mongoose from 'mongoose';

import {
  DENTITION_TYPES,
  SURFACE_CONDITIONS,
  SURFACES,
  TOOTH_STATES,
  defaultTeeth,
  normalizeToothRef,
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
      // Legacy Universal code (1-32), retained for backward compatibility.
      // Canonical code is `fdi`; the pre-validate hook keeps both in sync.
      type: Number,
      required: true,
      min: 1,
      max: 32,
    },
    fdi: {
      // Canonical FDI World Dental Federation code (ISO 3950: 11-18,
      // 21-28, 31-38, 41-48). Backfilled from `number` by migration 005.
      type: Number,
      default: null,
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
    // PRD §6.5: every tooth edit is archived here so prior states can be
    // reviewed/rolled back (who/when/what).
    history: {
      type: [
        new mongoose.Schema(
          {
            number: { type: Number, required: true, min: 1, max: 32 },
            fdi: { type: Number, default: null },
            state: { type: String, enum: TOOTH_STATES, required: true },
            surfaces: { type: surfaceSchema, default: () => ({}) },
            notes: { type: String, trim: true, maxlength: 500, default: '' },
            editedAt: { type: Date, default: () => new Date() },
            editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
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

// Cap the embedded history so charts cannot grow without bound.
const MAX_CHART_HISTORY = 500;
dentalChartSchema.pre('save', function capHistory() {
  if (this.isModified('history') && this.history.length > MAX_CHART_HISTORY) {
    this.history = this.history.slice(-MAX_CHART_HISTORY);
  }
});

/**
 * Ensure every chart always carries a full 32-tooth array, even if it was
 * created before the default existed or pruned by an older client.
 */
dentalChartSchema.pre('validate', function ensureTeeth() {
  if (!Array.isArray(this.teeth) || this.teeth.length === 0) {
    this.teeth = defaultTeeth();
  }
});

/**
 * S1 (FDI unification): keep the canonical `fdi` code and the legacy
 * Universal `number` in sync on every tooth and history entry. FDI wins on
 * conflict; a lone `number` derives `fdi` (backward compatibility with
 * pre-S1 clients and documents). Entries with neither valid code are left
 * for the route validators to reject — the model never invents a tooth.
 */
function syncToothCodes(entry) {
  if (!entry) return;
  const synced = normalizeToothRef({ fdi: entry.fdi ?? null, number: entry.number ?? null });
  if (!synced) return;
  entry.fdi = synced.fdi;
  entry.number = synced.universal;
}

dentalChartSchema.pre('validate', function syncChartToothCodes() {
  for (const tooth of this.teeth || []) syncToothCodes(tooth);
  for (const entry of this.history || []) syncToothCodes(entry);
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
