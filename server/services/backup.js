import { spawn } from "node:child_process";
import { mkdir, stat, rm, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import BackupLog from "../modules/site/backup/backupLog.model.js";
import { encryptFile } from "../utils/encryption.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBackupDir() {
  return process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
}

function getRetentionDays(override) {
  if (typeof override === "number" && override > 0) return override;
  return parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30;
}

function getMongoUri() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is required for backups');
  return uri;
}

function parseDbName(uri) {
  const match = uri.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : "dental-clinic";
}

function runMongodump(mongodumpBin, uri, archivePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(mongodumpBin, [
      `--uri=${uri}`,
      `--archive=${archivePath}`,
      "--gzip",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300000,
    });

    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `mongodump exited with code ${code}`));
    });

    proc.on("error", (err) => reject(err));
  });
}

// Interlock: never run two mongodumps at once. The cron and the manual
// "run now" endpoint share this process, so a manual trigger while a
// scheduled backup is still running is rejected instead of writing two
// archives to the same dir.
let backupInProgress = false;

export async function performBackup(type = "scheduled", triggeredBy = null, options = {}) {
  if (backupInProgress) {
    throw new Error("A backup is already in progress. Please try again when it finishes.");
  }

  const start = Date.now();
  const backupDir = getBackupDir();
  const retentionDays = getRetentionDays(options.retentionDays);
  const uri = getMongoUri();

  backupInProgress = true;

  await mkdir(backupDir, { recursive: true });

  const dbName = parseDbName(uri);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = path.join(backupDir, `backup-${timestamp}.archive`);

  let finalPath = archivePath;
  let encrypted = false;

  const logEntry = await BackupLog.create({
    filename: path.basename(archivePath),
    status: "running",
    type,
    triggeredBy: triggeredBy,
    encrypted: false,
  });

  try {
    const mongodumpBin = process.env.MONGODUMP_PATH || "mongodump";
    
    const { execSync } = await import("node:child_process");
    const checkCmd = process.platform === "win32" ? `where ${mongodumpBin}` : `command -v ${mongodumpBin}`;
    try {
      execSync(checkCmd, { stdio: "ignore" });
    } catch {
      throw new Error("mongodump not found. Install MongoDB Database Tools or set MONGODUMP_PATH in .env");
    }
    
    await runMongodump(mongodumpBin, uri, archivePath);

    // Encrypt the backup if BACKUP_ENCRYPT=true (or a key is configured).
    // Explicitly required: never silently save an unencrypted backup when encryption is requested.
    const encryptionEnabled = process.env.BACKUP_ENCRYPT === 'true' || process.env.BACKUP_ENCRYPTION_KEY;

    if (encryptionEnabled) {
      if (!process.env.BACKUP_ENCRYPTION_KEY) {
        throw new Error('BACKUP_ENCRYPT=true but BACKUP_ENCRYPTION_KEY is not set in .env');
      }
      try {
        const encryptedPath = archivePath + '.enc';
        await encryptFile(archivePath, encryptedPath);
        await unlink(archivePath);
        finalPath = encryptedPath;
        encrypted = true;
        console.log('[Backup] Backup encrypted successfully');
      } catch (encErr) {
        console.error('[Backup] Encryption failed:', encErr.message);
        throw encErr;
      }
    }

    const stats = await stat(finalPath);
    const durationMs = Date.now() - start;

    let dbSizeBytes = 0;
    try {
      const dbStats = await mongoose.connection.db.admin().command({
        dbStats: 1,
        scale: 1,
      });
      dbSizeBytes = dbStats.dataSize || 0;
    } catch (err) {
      console.warn('[Backup] Could not fetch dbStats:', err.message);
    }

    logEntry.filename = path.basename(finalPath);
    logEntry.encrypted = encrypted;
    logEntry.status = "completed";
    logEntry.sizeBytes = stats.size;
    logEntry.durationMs = durationMs;
    logEntry.dbSizeBytes = dbSizeBytes;
    await logEntry.save();

    await cleanOldBackups(backupDir, retentionDays);

    return logEntry;
  } catch (err) {
    logEntry.status = "failed";
    logEntry.error = err.message || String(err);
    logEntry.durationMs = Date.now() - start;
    await logEntry.save();

    try { await rm(finalPath); } catch {}

    throw err;
  } finally {
    backupInProgress = false;
  }
}

async function cleanOldBackups(backupDir, retentionDays) {
  const retention = getRetentionDays(retentionDays);
  const cutoff = Date.now() - retention * 24 * 60 * 60 * 1000;

  try {
    const files = await readdir(backupDir);
    for (const file of files) {
      if (!file.startsWith("backup-")) continue;
      const filePath = path.join(backupDir, file);
      const fileStat = await stat(filePath);
      if (fileStat.isFile() && fileStat.mtimeMs < cutoff) {
        await rm(filePath);
        console.log(`[Backup] Cleaned old backup: ${file}`);
      }
    }
  } catch (err) {
    console.error("[Backup] Cleanup error:", err.message);
  }
}

export async function listBackups(page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    BackupLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BackupLog.countDocuments(),
  ]);
  return { logs, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getBackupById(id) {
  return BackupLog.findById(id).lean();
}
