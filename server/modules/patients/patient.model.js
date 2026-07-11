import mongoose from "mongoose";

import Counter from '../../core/counters.js';

export const GENDER_VALUES = ["male", "female", "other", "unknown"];

export const GENDER_LABELS = Object.freeze({
  male: "Male",
  female: "Female",
  other: "Other",
  unknown: "Unknown",
});

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
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
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
  const nextSeq = await Counter.next("patient", this.tenant);
  this.patientId = `PT-${String(nextSeq).padStart(5, "0")}`;
});

patientSchema.index({ tenant: 1, patientId: 1 }, { unique: true });
patientSchema.index({ firstName: 1, lastName: 1 });
patientSchema.index({ branch: 1, isActive: 1 });

const Patient = mongoose.model("Patient", patientSchema);

export default Patient;
