import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Load the local .env when present (dev machine). Never overrides
// values already set by the environment (e.g. CI secrets).
dotenv.config({ path: path.join(here, "..", ".env"), quiet: true });

// Guarantee a runnable baseline so the suite works without a .env
// (fresh clone / CI). dotenv above does not overwrite these when set.
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "test-only-jwt-secret";
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = "test-only-jwt-refresh-secret";
if (!process.env.JWT_2FA_SECRET) process.env.JWT_2FA_SECRET = "test-only-jwt-2fa-secret";
if (!process.env.CLIENT_URL) process.env.CLIENT_URL = "http://localhost:5173";
if (!process.env.SITE_RECOVERY_KEY) process.env.SITE_RECOVERY_KEY = "test-only-recovery-key";
if (!process.env.BACKUP_ENCRYPTION_KEY) process.env.BACKUP_ENCRYPTION_KEY = "a".repeat(64);
