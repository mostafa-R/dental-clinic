import mongoose from "mongoose";

/**
 * Site Alert — persistent, PHI-free platform notifications.
 *
 * Lifecycle: active -> acknowledged -> resolved.
 * Deduplication key: `fingerprint` (type + scope key + tenantId). One document
 * per fingerprint; repeated occurrences bump `occurrenceCount`/`lastSeenAt`
 * instead of creating new rows, so an alert can never spam the feed while it
 * stays in the active/acknowledged state. Recovery transitions it to resolved
 * and a fresh episode re-creates it.
 */
const siteAlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "error_rate",
        "memory",
        "redis",
        "mongodb",
        "response_time",
        "tenant_quota",
        "tenant_spike",
        "backup",
        "quarantine",
        "subscription",
      ],
    },
    severity: {
      type: String,
      required: true,
      enum: ["critical", "warning", "info"],
    },
    scope: {
      type: String,
      required: true,
      enum: ["platform", "tenant"],
      default: "platform",
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    source: { type: String, default: "system" },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
    },
    fingerprint: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "acknowledged", "resolved"],
      default: "active",
    },
    firstSeenAt: { type: Date, required: true, default: Date.now },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    acknowledgedAt: { type: Date, default: null },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SiteAdmin",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SiteAdmin",
      default: null,
    },
    occurrenceCount: { type: Number, default: 1 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

siteAlertSchema.index({ fingerprint: 1 }, { unique: true });
siteAlertSchema.index({ status: 1, lastSeenAt: -1 });
siteAlertSchema.index({ type: 1, status: 1 });
siteAlertSchema.index({ severity: 1 });
siteAlertSchema.index({ tenant: 1 });
siteAlertSchema.index({ createdAt: -1 });

const SiteAlert = mongoose.model("SiteAlert", siteAlertSchema);
export default SiteAlert;