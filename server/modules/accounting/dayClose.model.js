import mongoose from 'mongoose';

import { round2 } from '../../constants/accounting.js';

/**
 * PRD §7.5 / BR-BL-04: end-of-day cash reconciliation per branch.
 *
 * The expected figures are snapshotted from the ledgers at close time; the
 * manager counts the drawer (`countedCash`) and the difference is stored
 * permanently. Records are immutable audit evidence — they are never updated
 * or deleted once created.
 */
const dayCloseSchema = new mongoose.Schema(
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
    // Start-of-day timestamp so { branch, date } uniquely identifies a shift.
    date: {
      type: Date,
      required: true,
    },
    expected: {
      cash: { type: Number, default: 0, set: (v) => round2(v) },
      card: { type: Number, default: 0, set: (v) => round2(v) },
      transfer: { type: Number, default: 0, set: (v) => round2(v) },
      wallet: { type: Number, default: 0, set: (v) => round2(v) },
    },
    countedCash: { type: Number, required: true, min: 0, set: (v) => round2(v) },
    difference: { type: Number, default: 0, set: (v) => round2(v) },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    closedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

dayCloseSchema.set('toJSON', { virtuals: true });
dayCloseSchema.set('toObject', { virtuals: true });

dayCloseSchema.index({ branch: 1, date: 1 }, { unique: true });
dayCloseSchema.index({ tenant: 1, date: -1 });

const DayClose = mongoose.model('DayClose', dayCloseSchema);

export default DayClose;
