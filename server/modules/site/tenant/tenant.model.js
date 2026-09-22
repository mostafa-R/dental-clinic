import mongoose from "mongoose";
import { parseStorageToMB } from "../../platform/plan.utils.js";

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
      maxlength: 200,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 30,
    },
    plan: {
      type: String,
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planModules: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "planModules must contain at least one module",
      },
    },
    status: {
      type: String,
      enum: Object.values(TENANT_STATUS),
      default: TENANT_STATUS.TRIAL,
    },
    quarantineReason: {
      type: String,
      default: null,
      maxlength: 1000,
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
    // IANA timezone of the clinic's local time. All "local day" date-range
    // handling (calendar views, live queue "today", date-only query params)
    // resolves through this value, never the server's OS timezone. Falls back
    // to APP_DEFAULT_TZ / UTC when unset — set this per tenant so clinics
    // east/west of UTC get correct day windows.
    timezone: {
      type: String,
      trim: true,
      maxlength: 60,
      default: () => process.env.APP_DEFAULT_TZ || 'UTC',
    },
    address: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    city: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },
    country: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },
    settings: {
      maxBranches: {
        type: Number,
        required: true,
      },
      maxDoctors: {
        type: Number,
        required: true,
      },
      maxPatients: {
        type: Number,
        required: true,
      },
      storageLimit: {
        type: Number, // in MB
        required: true,
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

// Generate slug only when one has never been assigned. The slug is the
// tenant's subdomain endpoint, so it is IMMUTABLE once created: renaming the
// clinic must never silently change clinic-a.dentalos.app to clinic-b.... At
// creation the service pre-computes a unique slug (with -1/-2 suffixes to
// avoid collisions), so this hook only fills a missing slug for brand-new or
// legacy documents.
tenantSchema.pre("save", function generateSlug() {
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100);
  }
});

// Update settings based on plan — strict, no fallbacks.
// planDoc is required and must carry explicit limits + modules.
tenantSchema.methods.updatePlanSettings = function updatePlanSettings(planDoc) {
  if (!planDoc) {
    throw new Error("Plan is required — tenant cannot be created without an explicit Plan");
  }
  if (planDoc.limits?.maxBranches === undefined) {
    throw new Error("Plan.limits.maxBranches is required");
  }
  if (planDoc.limits?.maxDoctors === undefined) {
    throw new Error("Plan.limits.maxDoctors is required");
  }
  if (planDoc.limits?.maxPatients === undefined) {
    throw new Error("Plan.limits.maxPatients is required");
  }
  const rawStorage = planDoc.limits?.storageLimit ?? planDoc.limits?.storage;
  if (rawStorage === undefined || rawStorage === null || rawStorage === '') {
    throw new Error("Plan.limits.storage is required");
  }
  if (!Array.isArray(planDoc.modules) || planDoc.modules.length === 0) {
    throw new Error("Plan.modules must contain at least one module");
  }
  this.settings.maxBranches = planDoc.limits.maxBranches;
  this.settings.maxDoctors = planDoc.limits.maxDoctors;
  this.settings.maxPatients = planDoc.limits.maxPatients;
  // Plan stores storage as "5GB"/"500MB"/"1TB" (string) or MB (number);
  // Tenant stores settings.storageLimit in MB.
  this.settings.storageLimit = parseStorageToMB(rawStorage);
  if (this.settings.storageLimit === undefined) {
    throw new Error("Plan.limits.storage is invalid");
  }
  this.plan = planDoc.key || planDoc.name?.toLowerCase().replace(/\s+/g, "_");
  if (!this.plan) {
    throw new Error("Plan key/name is required");
  }
  this.planId = planDoc._id;
  this.planModules = planDoc.modules;
};

const Tenant = mongoose.model("Tenant", tenantSchema);

export default Tenant;
