import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function print2faBootstrap(admin, result) {
  console.log(`2FA enabled for ${admin.email}`);
  console.log(`  TOTP secret: ${result.secret}`);
  console.log(`  Authenticator URI: ${result.otpauth}`);
  console.log("  Recovery codes (each usable once, store them safely):");
  result.backupCodes.forEach((code, i) => console.log(`    ${i + 1}. ${code}`));
}

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

  const { default: SiteAdmin } = await import("../modules/site/admin/admin.model.js");
  const { bootstrap2fa } = await import("../modules/site/auth/site2fa.service.js");

  const existing = await SiteAdmin.findOne({ email: email.toLowerCase() });

  if (existing) {
    console.log(`Site admin already exists: ${existing.email}`);
    if (existing.role === "super_admin" && !existing.twoFactorEnabled && process.env.SEED_BOOTSTRAP_2FA === "true") {
      const result = await bootstrap2fa(existing);
      print2faBootstrap(existing, result);
      console.warn("WARNING: 2FA was re-bootstrapped for the existing admin. Previous codes are no longer valid.");
    } else if (existing.role === "super_admin" && !existing.twoFactorEnabled) {
      console.warn("WARNING: super admin has 2FA disabled and cannot log in. Re-run with SEED_BOOTSTRAP_2FA=true or use the recovery endpoint.");
    }
  } else {
    const admin = await SiteAdmin.create({
      name: "Site Admin",
      email,
      password,
      role: "super_admin",
      isActive: true,
    });
    console.log(`Created site admin: ${email}`);

    const result = await bootstrap2fa(admin);
    print2faBootstrap(admin, result);
  }

  await mongoose.disconnect();
  console.log("Seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
