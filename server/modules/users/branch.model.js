import mongoose from "mongoose";

const branchSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    address: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

branchSchema.index({ tenant: 1, name: 1 }, { unique: true });

const Branch = mongoose.model("Branch", branchSchema);

export default Branch;
