import mongoose from "mongoose";

const platformSettingSchema = new mongoose.Schema(
  {
    autoSuspendDays: { type: Number, default: 30 },
    emailNotifications: { type: Boolean, default: true },
    maintenanceMode: { type: Boolean, default: false },
    allowedDomains: [{ type: String }],
    maxTenants: { type: Number, default: 1000 },
    defaultPlan: { type: String, default: "starter" },
    trialDays: { type: Number, default: 14 },
    backupEnabled: { type: Boolean, default: true },
    backupRetentionDays: { type: Number, default: 30 },
    backupTime: { type: String, default: "02:00" },
  },
  { timestamps: true },
);

const PlatformSetting = mongoose.model("PlatformSetting", platformSettingSchema);
export default PlatformSetting;
