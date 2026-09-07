import mongoose from 'mongoose';

import {
  ACTION_TYPES,
  CONDITION_OPS,
  TRIGGER_KEYS,
} from '../../constants/automations.js';

/**
 * Condition evaluated against the event payload:
 *   field  → dot-path into `event.data` (falls back to the event root)
 *   op     → one of CONDITION_OPS
 *   value  → expected operand (string/number/boolean/array)
 */
const conditionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true, maxlength: 200 },
    op: { type: String, enum: CONDITION_OPS, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

/**
 * Action executed when the rule matches:
 *   send_whatsapp → config: { to, message }   (placeholders rendered)
 *   notify_branch → config: { message }       (branch socket alert)
 *   webhook       → config: { url, headers }  (HTTP POST of the event)
 */
const actionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ACTION_TYPES, required: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const automationSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    // Optional branch scope: null → runs for every branch in the tenant.
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    name: {
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
    key: {
      // Stable identifier for installed built-in templates (deduplication).
      type: String,
      trim: true,
      maxlength: 60,
      default: '',
    },
    isTemplate: {
      type: Boolean,
      default: false,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    trigger: {
      type: {
        type: String,
        enum: TRIGGER_KEYS,
        required: true,
      },
    },
    conditions: {
      type: [conditionSchema],
      default: [],
    },
    actions: {
      type: [actionSchema],
      validate: [
        (v) => Array.isArray(v) && v.length > 0,
        'At least one action is required',
      ],
    },
    // Minimum minutes between two executions of the same rule (anti-spam).
    cooldownMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastTriggeredAt: {
      type: Date,
      default: null,
    },
    lastRunStatus: {
      type: String,
      enum: ['success', 'failed', 'skipped', ''],
      default: '',
    },
    lastError: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    runCount: {
      type: Number,
      default: 0,
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

// One rule per (tenant, name) — templates dedupe via the same uniqueness.
automationSchema.index(
  { tenant: 1, name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
automationSchema.index({ tenant: 1, enabled: 1, isActive: 1, 'trigger.type': 1 });

const Automation = mongoose.model('Automation', automationSchema);

export default Automation;