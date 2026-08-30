import mongoose from "mongoose";

import Counter from '../../core/counters.js';

export const GENDER_VALUES = ["male", "female", "other", "unknown"];

const conditionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const medicalHistorySchema = new mongoose.Schema(
  {
    chronicConditions: { type: [conditionSchema], default: [] },
    allergies: { type: [conditionSchema], default: [] },
    notes: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const patientSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
      default: null,
    },
    patientId: {
      type: String,
      required: true,
      index: true,
      maxlength: 20,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
      maxlength: 30,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: 254,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: GENDER_VALUES,
      default: "unknown",
    },
    address: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    medicalHistory: {
      type: medicalHistorySchema,
      default: () => ({}),
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // PRD §6.3 duplicate management: set when this record was merged into
    // another patient; the record is archived and kept for audit trail.
    mergedInto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      default: null,
    },
  },
  { timestamps: true },
);

patientSchema.virtual("fullName").get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

patientSchema.virtual("age").get(function age() {
  if (!this.dateOfBirth) return null;
  const diff = Date.now() - this.dateOfBirth.getTime();
  const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  return years >= 0 ? years : null;
});

patientSchema.set("toJSON", { virtuals: true });
patientSchema.set("toObject", { virtuals: true });

patientSchema.pre("validate", async function assignPatientId() {
  if (this.patientId) return;
  const nextSeq = await Counter.next("patient", this.tenant, this.$session?.());
  this.patientId = `PT-${String(nextSeq).padStart(5, "0")}`;
});

patientSchema.index({ tenant: 1, patientId: 1 }, { unique: true });
patientSchema.index({ firstName: 1, lastName: 1 });
patientSchema.index({ branch: 1, isActive: 1 });

// PRD §6.3: phone numbers are unique per Tenant+Branch (app-level check
// returns a friendly 409; this backstop closes the check-then-insert race).
// The partial filter skips empty phones so legacy records stay valid.
patientSchema.index(
  { tenant: 1, branch: 1, phone: 1 },
  {
    unique: true,
    name: "unique_phone_per_tenant_branch",
    partialFilterExpression: { phone: { $exists: true, $gt: "" } },
  },
);

const Patient = mongoose.model("Patient", patientSchema);

export default Patient;
