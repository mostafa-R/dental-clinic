import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const SITE_ROLES = { SUPER_ADMIN: "super_admin", ADMIN: "admin", SUPPORT: "support" };

const siteAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(SITE_ROLES), default: SITE_ROLES.SUPPORT },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true },
);

siteAdminSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const SiteAdmin = mongoose.model("SiteAdmin", siteAdminSchema);

async function seed() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not defined in .env");
    process.exit(1);
  }

  const email = process.env.SEED_SITEADMIN_EMAIL || process.env.SEED_SUPERADMIN_EMAIL;
  const password = process.env.SEED_SITEADMIN_PASSWORD || process.env.SEED_SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.error("SEED_SITEADMIN_EMAIL and SEED_SITEADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const existing = await SiteAdmin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`Site admin already exists: ${existing.email}`);
  } else {
    await SiteAdmin.create({ name: "Site Admin", email, password, role: "super_admin", isActive: true });
    console.log(`Created site admin: ${email}`);
  }

  await mongoose.disconnect();
  console.log("Seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
