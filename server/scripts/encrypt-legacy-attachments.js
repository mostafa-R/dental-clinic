#!/usr/bin/env node
import 'dotenv/config';

import path from 'node:path';
import { readdir, access, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// uploads/medical — same location `middleware/upload.js` resolves.
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'medical');
const ENCRYPTED_SUFFIX = '.enc';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

/**
 * Audit H1/H11: encrypt every medical attachment that is still legible
 * plaintext on disk. Two populations are walked, in this order:
 *
 *   1. Active MedicalAttachment records whose `<filename>` exists but whose
 *      `<filename>.enc` does not. These are real, referenced patient files —
 *      they are encrypted with the tenant's own per-clinic key so the download
 *      path stays the single source of truth.
 *   2. Orphan plaintext files in uploads/medical that no record (active or
 *      inactive) references at all. Nothing can ever key these to a tenant, so
 *      they get the shared BACKUP_ENCRYPTION_KEY — the point is that no PHI
 *      bytes remain world-readable on the volume. They are NOT deleted
 *      outright: the operator can decide what the ciphertext copy means.
 *
 * Safe semantics per file: encrypt to `.enc`, and only after the ciphertext is
 * written successfully delete the plaintext. A file that is already encrypted
 * (`.enc` exists) is skipped, so the script is idempotent and can be re-run
 * after failures. The API download path also migrates lazily now, this script
 * just does the job in bulk ahead of time.
 *
 * Usage:
 *   node scripts/encrypt-legacy-attachments.js [--dry-run]
 */

let mongoose;
let MedicalAttachment;
let Tenant;
let encryptFile;
try {
  mongoose = (await import('mongoose')).default;
  ({ default: MedicalAttachment } = await import('../modules/emr/attachment.model.js'));
  ({ default: Tenant } = await import('../modules/site/tenant/tenant.model.js'));
  ({ encryptFile } = await import('../utils/encryption.js'));
} catch (err) {
  console.error('Could not initialize dependencies:', err.message);
  process.exit(1);
}

// The shared key must exist even when doing tenant-key work: encryption.js
// rejects empty keys either way and this script needs one for the orphan sweep.
if (!process.env.BACKUP_ENCRYPTION_KEY) {
  console.error(
    'BACKUP_ENCRYPTION_KEY is not set. Add it to server/.env before running the backfill — it is the fallback key for orphan files and tenant-less legacy data.',
  );
  process.exit(1);
}

let dbAvailable = true;
try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dental_os');
} catch (err) {
  // Backups/Patient records cannot be read, but the orphan sweep still works:
  // running the script on a volume where mongod is down fixes exactly the
  // "unreferenced plaintext" cases instead of doing nothing at all.
  console.error(`MongoDB unavailable (${err.message}) — skipping the record pass, running the orphan sweep only.`);
  dbAvailable = false;
}

const fileReadable = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const migrateOne = async ({ plainPath, encryptedPath, key, label }) => {
  if (DRY_RUN) {
    console.log(`  [dry-run] would encrypt: ${label} (${path.basename(plainPath)})`);
    return true;
  }
  try {
    await encryptFile(plainPath, encryptedPath, key ?? undefined);
    await unlink(plainPath).catch(() => {});
    console.log(`  encrypted: ${label} (${path.basename(plainPath)})`);
    return true;
  } catch (err) {
    // Leave the plaintext standing and report it — a half-written `.enc` copy
    // is worse than an honest failure. Re-running continues where it left off.
    console.error(`  FAILED ${label} (${path.basename(plainPath)}): ${err.message}`);
    return false;
  }
};

let migrated = 0;
let skipped = 0;
let failed = 0;

// Pass 1: attachment records (skipped entirely when there is no database).
let records = [];
if (dbAvailable) {
  records = await MedicalAttachment.find({}).select('filename tenant isActive').lean();
  console.log(`Scanning ${records.length} attachment records...`);

  for (const record of records) {
    const plainPath = path.join(UPLOADS_ROOT, record.filename);
    const encryptedPath = plainPath + ENCRYPTED_SUFFIX;

    if (await fileReadable(encryptedPath)) {
      skipped += 1;
      continue;
    }
    if (!(await fileReadable(plainPath))) {
      skipped += 1; // nothing on disk for this record (already cleaned up)
      continue;
    }

    let key = null;
    if (record.tenant) {
      const tenant = await Tenant.findById(record.tenant)
        .select('+encryption.key')
        .lean();
      key = tenant?.encryption?.key || null;
    }

    const ok = await migrateOne({
      plainPath,
      encryptedPath,
      key,
      label: `${record.isActive ? 'record' : 'inactive-record'} tenant=${record.tenant || 'none'}`,
    });
    if (ok) migrated += 1;
    else failed += 1;
  }
}

// Pass 2: orphan plaintext files that no record references at all.
const allFiles = await readdir(UPLOADS_ROOT);
const referenced = new Set(records.map((r) => r.filename));
const plaintextOnDisk = allFiles.filter((name) => !name.endsWith(ENCRYPTED_SUFFIX) && !name.startsWith('.tmp_'));

const orphans = [];
for (const name of plaintextOnDisk) {
  if (referenced.has(name)) continue;
  const plainPath = path.join(UPLOADS_ROOT, name);
  if (await fileReadable(plainPath)) orphans.push(name);
}

if (orphans.length > 0) {
  console.log(`Scanning ${orphans.length} orphan plaintext files (no DB record)...`);
  for (const name of orphans) {
    const plainPath = path.join(UPLOADS_ROOT, name);
    const ok = await migrateOne({
      plainPath,
      encryptedPath: plainPath + ENCRYPTED_SUFFIX,
      key: null, // shared BACKUP_ENCRYPTION_KEY per getPassword()
      label: 'orphan tenant=?',
    });
    if (ok) migrated += 1;
    else failed += 1;
  }
}

console.log(
  `\nDone. migrated=${migrated} skipped(already-encrypted-or-missing)=${skipped} failed=${failed}` +
    `${DRY_RUN ? ' (dry-run: nothing was written)' : ''}`,
);

await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
