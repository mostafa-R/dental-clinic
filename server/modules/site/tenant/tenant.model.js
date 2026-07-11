import mongoose from "mongoose";

export const TENANT_STATUS = {
  ACTIVE: "active",
  TRIAL: "trial",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
};

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    plan: {
      type: String,
      default: "starter",
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      default: null,
    },
    planModules: {
      type: [String],
      default: ["dashboard", "patients", "appointments", "billing"],
    },
    status: {
      type: String,
      enum: Object.values(TENANT_STATUS),
      default: TENANT_STATUS.TRIAL,
    },
    quarantineReason: {
      type: String,
      default: null,
    },
    quarantinePreviousStatus: {
      type: String,
      default: null,
    },
    trialEndsAt: {
      type: Date,
      default: null,
    },
    subscriptionEndsAt: {
      type: Date,
      default: null,
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      default: "",
    },
    settings: {
      maxBranches: {
        type: Number,
        default: 1,
      },
      maxDoctors: {
        type: Number,
        default: 3,
      },
      maxPatients: {
        type: Number,
        default: 500,
      },
      storageLimit: {
        type: Number, // in MB
        default: 5120, // 5GB
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    encryption: {
      key: { type: String, select: false },
      algorithm: { type: String, default: 'aes-256-gcm' },
      createdAt: { type: Date },
    },
  },
  { timestamps: true },
);

// Generate slug from name before saving
tenantSchema.pre("save", function generateSlug() {
  if (this.isModified("name") && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);
  }
});

// Update settings based on plan
tenantSchema.methods.updatePlanSettings = function updatePlanSettings(planDoc) {
  if (planDoc) {
    this.settings.maxBranches = planDoc.limits?.maxBranches ?? this.settings.maxBranches;
    this.settings.maxDoctors = planDoc.limits?.maxDoctors ?? this.settings.maxDoctors;
    this.settings.maxPatients = planDoc.limits?.maxPatients ?? this.settings.maxPatients;
    this.settings.storageLimit = planDoc.limits?.storageLimit
      ?? (typeof planDoc.limits?.storage === 'string'
        ? parseInt(planDoc.limits.storage) * 1024 || this.settings.storageLimit
        : planDoc.limits?.storage)
      ?? this.settings.storageLimit;
    this.plan = planDoc.key || planDoc.name?.toLowerCase().replace(/\s+/g, "_") || this.plan;
    this.planId = planDoc._id;
    this.planModules = planDoc.modules || this.planModules;
  } else {
    // Hardcoded fallback when no Plan doc exists (legacy)
    const fallback = {
      starter:  { maxBranches: 1, maxDoctors: 3, maxPatients: 500, storageLimit: 5120 },
      professional: { maxBranches: 5, maxDoctors: 10, maxPatients: 5000, storageLimit: 51200 },
      enterprise:   { maxBranches: 999, maxDoctors: 999, maxPatients: 999999, storageLimit: 0 },
    };
    const s = fallback[this.plan] || fallback.starter;
    Object.assign(this.settings, s);
  }
};

const Tenant = mongoose.model("Tenant", tenantSchema);

export default Tenant;
