import mongoose from 'mongoose';

/**
 * Execution log for the Automation engine — the audit trail for every
 * automated WhatsApp message, branch notification or webhook call.
 * Retained for 90 days.
 */
const actionResultSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    status: {
      type: String,
      enum: ['success', 'error', 'skipped'],
      default: 'success',
    },
    error: { type: String, trim: true, maxlength: 500, default: '' },
    output: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const automationRunSchema = new mongoose.Schema(
  {
    automation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Automation',
      required: true,
      index: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    triggerType: {
      type: String,
      required: true,
      index: true,
    },
    event: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'skipped'],
      required: true,
    },
    reason: {
      // e.g. "cooldown active", "condition not matched"
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    actionResults: {
      type: [actionResultSchema],
      default: [],
    },
    startedAt: {
      type: Date,
      default: () => new Date(),
    },
    finishedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

automationRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
automationRunSchema.index({ tenant: 1, createdAt: -1 });

const AutomationRun = mongoose.model('AutomationRun', automationRunSchema);

export default AutomationRun;