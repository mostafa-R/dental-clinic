import mongoose from "mongoose";

export const APPOINTMENT_STATUS = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

/**
 * Allowed forward transitions per current status.
 * Terminal states (completed/cancelled/no_show) have no outgoing edges.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  scheduled: ["confirmed", "checked_in", "cancelled", "no_show"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
});

export function canTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

const appointmentSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
      default: null,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    chair: {
      type: String,
      trim: true,
      default: "",
    },
    start: {
      type: Date,
      index: true,
    },
    end: {
      type: Date,
    },
    status: {
      type: String,
      enum: APPOINTMENT_STATUS,
      default: "scheduled",
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reminderSentAt: {
      type: Date,
      default: null,
    },
    secondaryReminderSentAt: {
      type: Date,
      default: null,
    },
    confirmSentAt: {
      type: Date,
      default: null,
    },
    // Set when the patient is checked in (BR-PT-03 late-arrival detection).
    checkedInAt: {
      type: Date,
      default: null,
    },
    // BR-PT-03: flagged when the patient arrives after more than 50% of the
    // slot has elapsed — reception is notified and the visit can be pushed to
    // the end of the queue.
    lateArrival: {
      flagged: { type: Boolean, default: false },
      minutesLate: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

appointmentSchema.pre("validate", function validateTimes() {
  if (this.start && this.end && this.end <= this.start) {
    this.invalidate("end", "End time must be after start time");
  }
});

// Active statuses that occupy a doctor's schedule. Cancelled/completed/no-show
// records release the slot so it can be rebooked.
const ACTIVE_STATUSES = ["scheduled", "confirmed", "checked_in", "in_progress"];

/**
 * Doctor double-booking guard at the model level.
 *
 * The partial unique index on { branch, doctor, start } only blocks two
 * appointments that share the exact same start time. This hook also rejects
 * overlapping appointments at different start times (e.g. 10:00-11:00 vs
 * 10:30-11:30), closing the check-then-insert window for direct model writes.
 */
appointmentSchema.pre("validate", async function assertNoDoctorOverlap() {
  if (!ACTIVE_STATUSES.includes(this.status)) return;
  if (!this.branch || !this.doctor || !this.start || !this.end) return;

  const candidates = await this.constructor
    .find({
      branch: this.branch,
      doctor: this.doctor,
      status: { $in: ACTIVE_STATUSES },
      start: { $lt: this.end },
      end: { $gt: this.start },
      _id: { $ne: this._id },
    })
    .select("_id start end")
    .limit(20)
    .lean();

  if (candidates.length === 0) return;

  // BR-PT-02: honor the branch bufferTime — small spillovers are tolerated,
  // only overlaps longer than the buffer are rejected at the model level too.
  let bufferMinutes = 0;
  try {
    const branchDoc = await mongoose
      .model("Branch")
      .findById(this.branch)
      .select("bufferTime")
      .lean();
    bufferMinutes = branchDoc?.bufferTime ?? 0;
  } catch {
    bufferMinutes = 0; // Branch model unavailable → strict overlap check
  }
  const bufferMs = (bufferMinutes || 0) * 60000;

  const clash = candidates.find((c) => {
    const overlapMs =
      Math.min(this.end.getTime(), c.end.getTime()) -
      Math.max(this.start.getTime(), c.start.getTime());
    return overlapMs > bufferMs;
  });

  if (clash) {
    this.invalidate("start", "Doctor already has an overlapping appointment");
  }
});

appointmentSchema.virtual("durationMin").get(function durationMin() {
  if (!this.start || !this.end) return 0;
  return Math.round((this.end - this.start) / 60000);
});

appointmentSchema.set("toJSON", { virtuals: true });
appointmentSchema.set("toObject", { virtuals: true });

appointmentSchema.index({ branch: 1, start: 1 });
appointmentSchema.index({ doctor: 1, start: 1 });
appointmentSchema.index({ branch: 1, status: 1, start: 1 });

// Double-booking guard: a doctor cannot hold two live appointments at the same
// start time. The partial filter keeps cancelled/completed/no-show records out
// of the constraint so the same slot can be reused later.
appointmentSchema.index(
  { branch: 1, doctor: 1, start: 1 },
  {
    unique: true,
    partialFilterExpression: {
      start: { $type: "date" },
      status: { $in: ["scheduled", "confirmed", "checked_in", "in_progress"] },
    },
  },
);

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
