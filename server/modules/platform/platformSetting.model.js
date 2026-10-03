import mongoose from "mongoose";

const platformSettingSchema = new mongoose.Schema(
  {
    // `siteName` / `supportEmail` are part of the PUT /platform contract
    // (zod schema + Swagger) but had no model fields, so a super_admin
    // setting them got a 200 and the values were thrown away on read.
    siteName: { type: String, default: "", trim: true },
    supportEmail: { type: String, default: "", trim: true },
    autoSuspendDays: { type: Number, default: 30 },
    emailNotifications: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    allowedDomains: [{ type: String }],
    allowedSiteIps: { type: String, default: "" },
    maxTenants: { type: Number, default: 1000 },
    defaultPlan: { type: String },
    trialDays: { type: Number, default: 14 },
    backupEnabled: { type: Boolean, default: true },
    backupRetentionDays: { type: Number, default: 30 },
    backupTime: { type: String, default: "02:00" },
  },
  { timestamps: true },
);

const PlatformSetting = mongoose.model("PlatformSetting", platformSettingSchema);
export default PlatformSetting;
