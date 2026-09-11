import mongoose from "mongoose";

import { canonicalChairKey } from "./chairKey.js";

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
    // Canonical identity of the physical chair (see utils/chairKey.js). It is
    // what the unique double-booking indexes actually key on; kept out of API
    // responses because it is a technical key, not display data.
    chairKey: {
      type: String,
      trim: true,
      default: "",
      select: false,
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
    // Live-queue tracking (PRD §6.2). `queueNumber` is a snapshot of the
    // patient's position for today's (branch, doctor) queue, taken at booking;
    // the current position is always derived from ordering (see queueEngine).
    // The remaining fields dedupe patient-facing WhatsApp notifications.
    queueNumber: { type: Number, default: null },
    queueJoinedNotifiedAt: { type: Date, default: null },
    lastQueueAheadNotified: { type: Number, default: null },
    nearTurnNotifiedAt: { type: Date, default: null },
    turnNotifiedAt: { type: Date, default: null },
    completedSummarySentAt: { type: Date, default: null },
    // Optional link the doctor sets when completing a visit: the follow-up
    // appointment is rendered in the post-visit WhatsApp summary.
    nextAppointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
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

// Keep chairKey in sync whenever the raw `chair` label changes. Insert-by
// controller also sets it explicitly (findOneAndUpdate does not run these
// document hooks); this hook covers direct model writes.
appointmentSchema.pre("validate", function syncChairKey() {
  if (!this.isNew && !this.isModified("chair")) return;
  this.chairKey = canonicalChairKey(this.chair);
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

// Same patient cannot hold two live appointments that start at the exact same
// instant — the DB-level backstop for the app-level range check. Two requests
// that both pass that check concurrently cannot both insert, the unique index
// rejects the loser (E11000 → 409).
appointmentSchema.index(
  { branch: 1, patient: 1, start: 1 },
  {
    unique: true,
    partialFilterExpression: {
      start: { $type: "date" },
      status: { $in: ["scheduled", "confirmed", "checked_in", "in_progress"] },
    },
  },
);

// Same physical chair (by canonical chairKey) cannot host two live
// appointments at the same instant. `$gt: ""` restricts the constraint to
// documents whose chairKey is a PRESENT non-empty string: a missing field and
// the "no chair assigned" empty string both compare less than "", so walk-ins
// without a chair never collide with each other. Range overlaps at different
// start times are still caught by the app-level check.
appointmentSchema.index(
  { branch: 1, chairKey: 1, start: 1 },
  {
    unique: true,
    partialFilterExpression: {
      start: { $type: "date" },
      status: { $in: ["scheduled", "confirmed", "checked_in", "in_progress"] },
      chairKey: { $gt: "" },
    },
  },
);

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
