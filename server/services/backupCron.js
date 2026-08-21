import cron from "node-cron";
import { performBackup } from "./backup.js";
import PlatformSetting from "../modules/platform/platformSetting.model.js";

/**
 * Read the platform's backup schedule. Falls back to defaults when no
 * PlatformSetting row exists (e.g. before first settings save).
 */
async function getBackupConfig() {
  const settings = await PlatformSetting.findOne().lean();
  return {
    enabled: settings?.backupEnabled !== false,
    time: settings?.backupTime || "02:00",
    retentionDays: settings?.backupRetentionDays || 30,
  };
}

function toCronExpr(time) {
  const [hh, mm] = time.split(":");
  return `${mm} ${hh} * * *`;
}

async function runScheduledBackup() {
  try {
    // Re-check the toggle at run time so disabling backups mid-process takes
    // effect even though the cron slot is fixed at start.
    const config = await getBackupConfig();
    if (!config.enabled) {
      console.log("[Backup-Cron] Backups are disabled via Platform Settings — skipping");
      return;
    }

    console.log("[Backup-Cron] Starting scheduled backup...");
    const log = await performBackup("scheduled", null, { retentionDays: config.retentionDays });
    console.log(
      `[Backup-Cron] Backup completed: ${log.filename} (${(log.sizeBytes / 1024 / 1024).toFixed(2)} MB in ${log.durationMs}ms)`,
    );
  } catch (err) {
    console.error("[Backup-Cron] Backup failed:", err.message);
  }
}

let backupTask = null;

export async function startBackupCron() {
  if (backupTask) {
    backupTask.stop();
    backupTask = null;
  }

  const config = await getBackupConfig();
  if (!config.enabled) {
    console.log("[Backup-Cron] Backups are disabled via Platform Settings — not scheduling");
    return;
  }

  backupTask = cron.schedule(toCronExpr(config.time), runScheduledBackup);
  console.log(`[Backup-Cron] Scheduled daily at ${config.time} (${toCronExpr(config.time)})`);
}

export function stopBackupCron() {
  if (backupTask) {
    backupTask.stop();
    backupTask = null;
    console.log("[Backup-Cron] Cron stopped");
  }
}
