import mongoose from 'mongoose';

/**
 * Recall — a due follow-up for a patient (hygiene, review, post-procedure…).
 *
 * Conventions (mirrors patients/appointments):
 * - Every query is tenant-scoped; branch scoping follows filterByBranch().
 * - A recall is "active" while status is due/contacted/scheduled/postponed;
 *   completed/dismissed are terminal.
 * - Duplicate active recalls (same tenant+patient+type+source+due-day) are
 *   rejected by the partial unique index below AND by the application-level
 *   check in createRecallIfMissing (index is the race backstop).
 */

export const RECALL_STATUSES = ['due', 'contacted', 'scheduled', 'postponed', 'completed', 'dismissed'];

export const ACTIVE_RECALL_STATUSES = ['due', 'contacted', 'scheduled', 'postponed'];

export const RECALL_TYPES = [
  'hygiene',
  'follow_up',
  'treatment_review',
  'post_procedure',
  'periodic_check',
  'custom',
];

export const RECALL_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/** Legal forward transitions; terminal states have no outgoing edges. */
export const RECALL_TRANSITIONS = {
  due: ['contacted', 'scheduled', 'postponed', 'completed', 'dismissed'],
  contacted: ['scheduled', 'postponed', 'completed', 'dismissed'],
  scheduled: ['completed', 'dismissed', 'postponed'],
  postponed: ['due', 'contacted', 'scheduled', 'completed', 'dismissed'],
  completed: [],
  dismissed: [],
};

export function canTransitionRecall(from, to) {
  return (RECALL_TRANSITIONS[from] || []).includes(to);
}

/**
 * Duplicate-prevention key: same tenant+patient+type+source+due-day may only
 * have one active recall. Source-less manual recalls include the due day so
 * a repeated cadence (e.g. hygiene every 6 months) stays expressible while
 * an accidental double-submit on the same day is rejected.
 */
export function buildDedupeKey({ recallType, sourceAppointment, sourceTreatmentPlan, dueDate }) {
  const hasSource = !!(sourceAppointment || sourceTreatmentPlan);
  const dueDay = !hasSource && dueDate ? new Date(dueDate).toISOString().slice(0, 10) : '';
  return [
    recallType || '',
    sourceAppointment ? String(sourceAppointment) : '',
    sourceTreatmentPlan ? String(sourceTreatmentPlan) : '',
    dueDay,
  ].join('|');
}

const recallSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
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
    sourceAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    sourceTreatmentPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreatmentPlan',
      default: null,
    },
    // The normalized eventId that generated this recall (engine path).
    // Lets operators trace recall → source event in the events log.
    sourceEventId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: null,
    },
    recallType: {
      type: String,
      enum: RECALL_TYPES,
      default: 'follow_up',
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RECALL_STATUSES,
      default: 'due',
      index: true,
    },
    priority: {
      type: String,
      enum: RECALL_PRIORITIES,
      default: 'normal',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
    contactAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },
    outcome: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    postponedUntil: {
      type: Date,
      default: null,
    },
    scheduledAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    // Reminder-send guard for the due cron (idempotent re-runs).
    lastReminderAt: {
      type: Date,
      default: null,
    },
    dedupeKey: {
      type: String,
      trim: true,
      maxlength: 220,
      default: '',
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

recallSchema.pre('validate', function assignDedupeKey() {
  this.dedupeKey = buildDedupeKey({
    recallType: this.recallType,
    sourceAppointment: this.sourceAppointment,
    sourceTreatmentPlan: this.sourceTreatmentPlan,
    dueDate: this.dueDate,
  });
});

// Tenant-first compound indexes for the required query shapes.
recallSchema.index({ tenant: 1, dueDate: 1, status: 1 });
recallSchema.index({ tenant: 1, branch: 1, status: 1, dueDate: 1 });
recallSchema.index({ tenant: 1, patient: 1, dueDate: -1 });
recallSchema.index({ tenant: 1, assignedTo: 1, status: 1 });
// Active-duplicate backstop (application check first; index wins races).
recallSchema.index(
  { tenant: 1, patient: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_RECALL_STATUSES } },
    name: 'unique_active_recall',
  },
);

const Recall = mongoose.model('Recall', recallSchema);

export default Recall;
