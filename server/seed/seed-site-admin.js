import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

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

  // Import the actual SiteAdmin model
  const { default: SiteAdmin } = await import("../modules/site/admin/admin.model.js");

  const existing = await SiteAdmin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`Site admin already exists: ${existing.email}`);
  } else {
    await SiteAdmin.create({
      name: "Site Admin",
      email,
      password,
      role: "super_admin",
      isActive: true,
    });
    console.log(`Created site admin: ${email}`);
  }

  await mongoose.disconnect();
  console.log("Seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
