import cron from "node-cron";
import { performBackup } from "./backup.js";

async function runScheduledBackup() {
  try {
    console.log("[Backup-Cron] Starting scheduled backup...");
    const log = await performBackup("scheduled");
    console.log(
      `[Backup-Cron] Backup completed: ${log.filename} (${(log.sizeBytes / 1024 / 1024).toFixed(2)} MB in ${log.durationMs}ms)`,
    );
  } catch (err) {
    console.error("[Backup-Cron] Backup failed:", err.message);
  }
}

let backupTask = null;

export function startBackupCron() {
  backupTask = cron.schedule("0 2 * * *", runScheduledBackup);
  console.log("[Backup-Cron] Scheduled daily at 02:00");
}

export function stopBackupCron() {
  if (backupTask) {
    backupTask.stop();
    backupTask = null;
    console.log("[Backup-Cron] Cron stopped");
  }
}
