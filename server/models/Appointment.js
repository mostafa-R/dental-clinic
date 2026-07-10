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
    confirmSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

appointmentSchema.pre("validate", function validateTimes() {
  if (this.start && this.end && this.end <= this.start) {
    this.invalidate("end", "End time must be after start time");
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

const Appointment = mongoose.model("Appointment", appointmentSchema);

export default Appointment;
