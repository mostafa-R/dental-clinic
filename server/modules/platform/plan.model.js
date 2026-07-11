import mongoose from "mongoose";
import { MODULE_KEYS } from "../../constants/permissions.js";

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, unique: true, lowercase: true, trim: true },
    price: { type: Number, required: true, default: 0 },
    interval: { type: String, enum: ["month", "year"], default: "month" },
    modules: {
      type: [String],
      enum: MODULE_KEYS,
      default: ["dashboard", "patients", "appointments", "billing"],
    },
    limits: {
      maxBranches: { type: Number, default: 1 },
      maxDoctors: { type: Number, default: 3 },
      maxPatients: { type: Number, default: 500 },
      storage: { type: String, default: "5GB" },
    },
    support: { type: String, default: "Email" },
    features: [{ type: String }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

planSchema.pre("save", function generateKey() {
  if (this.isModified("name") && !this.key) {
    this.key = this.name.toLowerCase().replace(/\s+/g, "_");
  }
});

const Plan = mongoose.model("Plan", planSchema);
export default Plan;
