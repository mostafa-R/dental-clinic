import mongoose from 'mongoose';

/**
 * Event Log (PRD §25.4 — domain 8: منصة والأحداث والذكاء).
 *
 * Every business event published by the Event Bus is persisted here as the
 * system audit trail for the AI/Automation layers:
 *   `(tenantId, type, occurredAt)` with a 30-day TTL.
 */
const eventLogSchema = new mongoose.Schema(
  {
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
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    occurredAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { timestamps: true },
);

// Events are retained for 30 days then purged by MongoDB's TTL monitor.
eventLogSchema.index({ occurredAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
eventLogSchema.index({ tenant: 1, type: 1, occurredAt: -1 });

const EventLog = mongoose.model('EventLog', eventLogSchema);

export default EventLog;