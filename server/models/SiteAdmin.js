import bcrypt from "bcryptjs";
import mongoose from "mongoose";

export const SITE_ROLES = {
  SUPER_ADMIN: "super_admin",
  SITE_ADMIN: "site_admin",
  ADMIN: "admin",
  SUPPORT: "support",
};

const siteAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(SITE_ROLES),
      default: SITE_ROLES.SUPPORT,
    },
    permissions: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    twoFactorBackupCodes: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

siteAdminSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

siteAdminSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

siteAdminSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.twoFactorSecret;
  delete obj.twoFactorBackupCodes;
  return obj;
};

const SiteAdmin = mongoose.model("SiteAdmin", siteAdminSchema);

export default SiteAdmin;
