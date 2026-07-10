import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import BackupLog from "../models/BackupLog.js";
import PlatformSetting from "../models/PlatformSetting.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getBackupDir() {
  return process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
}

function getRetentionDays() {
  return parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 30;
}

function getMongoUri() {
  return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/dental-clinic';
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

export async function performBackup(type = "scheduled", triggeredBy = null) {
  const start = Date.now();
  const backupDir = getBackupDir();
  const uri = getMongoUri();

  fs.mkdirSync(backupDir, { recursive: true });

  const dbName = parseDbName(uri);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = path.join(backupDir, `backup-${timestamp}.archive`);

  const logEntry = await BackupLog.create({
    filename: path.basename(archivePath),
    status: "running",
    type,
    triggeredBy: triggeredBy,
  });

  try {
    const mongodumpBin = process.env.MONGODUMP_PATH || "mongodump";
    await runMongodump(mongodumpBin, uri, archivePath);

    const stats = fs.statSync(archivePath);
    const durationMs = Date.now() - start;

    let dbSizeBytes = 0;
    try {
      const dbStats = await mongoose.connection.db.admin().command({
        dbStats: 1,
        scale: 1,
      });
      dbSizeBytes = dbStats.dataSize || 0;
    } catch {}

    logEntry.status = "completed";
    logEntry.sizeBytes = stats.size;
    logEntry.durationMs = durationMs;
    logEntry.dbSizeBytes = dbSizeBytes;
    await logEntry.save();

    await cleanOldBackups(backupDir);

    return logEntry;
  } catch (err) {
    logEntry.status = "failed";
    logEntry.error = err.message || String(err);
    logEntry.durationMs = Date.now() - start;
    await logEntry.save();

    if (fs.existsSync(archivePath)) {
      fs.rmSync(archivePath);
    }

    throw err;
  }
}

async function cleanOldBackups(backupDir) {
  const retention = getRetentionDays();
  const cutoff = Date.now() - retention * 24 * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(backupDir);
    for (const file of files) {
      if (!file.startsWith("backup-")) continue;
      const filePath = path.join(backupDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && stat.mtimeMs < cutoff) {
        fs.rmSync(filePath);
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
