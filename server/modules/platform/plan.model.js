import mongoose from "mongoose";
import { MODULE_KEYS } from "../../constants/permissions.js";

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, unique: true, lowercase: true, trim: true },
    price: { type: Number, required: true },
    interval: { type: String, enum: ["month", "year"], required: true },
    modules: {
      type: [String],
      enum: MODULE_KEYS,
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "modules must contain at least one module",
      },
    },
    limits: {
      maxBranches: { type: Number, required: true },
      maxDoctors: { type: Number, required: true },
      maxPatients: { type: Number, required: true },
      storage: { type: String, required: true },
    },
    support: { type: String },
    features: [{ type: String }],
    isActive: { type: Boolean, required: true },
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
