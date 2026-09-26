import http from "node:http";

import app, { upgradeRateLimitStore } from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { runMigrations } from "./migrations/runner.js";
import { resolveExpiryMs } from "./utils/jwt.js";
import { setupDbMonitoring } from "./utils/dbMonitor.js";
import { startMetricsExport, stopMetricsExport } from "./utils/redisMetrics.js";
import { startAbuseCron, stopAbuseCron, stopAbuseFlusher } from "./services/abuseDetection.js";
import { startBackupCron, stopBackupCron } from "./services/backupCron.js";
import { startInstallmentCron, stopInstallmentCron } from "./services/installmentCron.js";
import { startInventoryCron, stopInventoryCron } from "./services/inventoryCron.js";
import { startConsentExpiryCron, stopConsentExpiryCron } from "./services/consentExpiryCron.js";
import { startNoShowCron, stopNoShowCron } from "./services/noShowCron.js";
import { startRecallCron, stopRecallCron } from "./services/recallCron.js";
import { startQueueNotifyCron, stopQueueNotifyCron } from "./services/queueNotifyCron.js";
import { startSuspensionCron, stopSuspensionCron } from "./services/suspensionCron.js";
import { startAlertCron, stopAlertCron } from "./modules/site/alert/alertEngine.js";
import { disconnectAllWhatsAppClients } from "./services/whatsapp.js";
import { startWhatsAppReminderCron, stopWhatsAppReminderCron } from "./services/whatsappReminderCron.js";
import { startEventBus } from "./services/eventBus.js";
import { startAutomationEngine } from "./services/automationEngine.js";
import { startRecallEngine, stopRecallEngine } from "./services/recallEngine.js";
import { getIO, initSocket } from "./socket/index.js";

const PORT = Number(process.env.PORT || 5000);

// Module-scoped so the fatal-error handlers can run the same drain a signal
// does. Exiting straight from `uncaughtException` used to drop in-flight
// requests and skip the watchdog entirely.
let httpServer = null;
let shuttingDown = false;



function validateEnv() {
  const required = [
    ["MONGO_URI", "MongoDB connection string"],
    ["JWT_SECRET", "JWT signing secret"],
    ["JWT_REFRESH_SECRET", "JWT refresh signing secret"],
  ];
  const missing = required.filter(([key]) => !process.env[key]);
  if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach(([key, desc]) => console.error(`  ${key} - ${desc}`));
    process.exit(1);
  }

  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    console.error("PORT must be a number between 1 and 65535");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_URL) {
    console.error("CLIENT_URL is required in production");
    process.exit(1);
  }

  // Token lifetimes drive cookie security, so a malformed value must fail the
  // boot rather than be silently reinterpreted at first login.
  for (const key of ["ACCESS_TOKEN_EXPIRY", "REFRESH_TOKEN_EXPIRY"]) {
    if (process.env[key] === undefined) continue;
    try {
      resolveExpiryMs(process.env[key], "12h", key);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
}

async function start() {
  validateEnv();

  await connectDB();
  await runMigrations().catch((err) => {
    console.error('[Migrations] Migration failed:', err.message);
  });

  // Setup database monitoring
  setupDbMonitoring();

  await connectRedis();
  await upgradeRateLimitStore();
  startMetricsExport();

  httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  startSuspensionCron();
  startAbuseCron();
  startAlertCron();
  startWhatsAppReminderCron();
  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    console.error(
      "[Backup] WARNING: BACKUP_ENCRYPTION_KEY is not set. Backup creation is disabled " +
        "until it is configured (backups refuse to run unencrypted).",
    );
  }
  startBackupCron().catch((err) => {
    console.error("[Backup-Cron] Failed to initialize:", err.message);
  });
  startInstallmentCron();
  startNoShowCron();
  startRecallCron();
  startQueueNotifyCron();
  startInventoryCron();
  startConsentExpiryCron();

  startEventBus();
  startAutomationEngine();
  startRecallEngine();

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Module-scoped so the fatal-error handlers below can drain the same way a
// signal does.
async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received. Shutting down gracefully...`);

  stopSuspensionCron();
  stopAbuseCron();
  stopAbuseFlusher();
  stopAlertCron();
  stopWhatsAppReminderCron();
  stopBackupCron();
  stopInstallmentCron();
  stopNoShowCron();
  stopRecallCron();
  stopQueueNotifyCron();
  stopInventoryCron();
  stopConsentExpiryCron();

  // Detach the fatal handlers first: a failure *during* drain must not
  // re-enter shutdown (guarded above) or abort the drain mid-way.
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");

  // Armed (not unref'd) and cleared on success, so a hung drain — a wedged
  // WhatsApp client, a Redis socket that never settles — cannot hold the
  // process open forever.
  const watchdog = setTimeout(() => {
    console.error("[Shutdown] Forced exit after 15s drain timeout");
    process.exit(exitCode || 1);
  }, 15000);

  try {
    await disconnectAllWhatsAppClients();

    stopMetricsExport();

    const io = getIO();
    if (io) io.close();

    await disconnectRedis();
    await disconnectDB();

    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log("HTTP server closed");
    }
  } catch (err) {
    console.error("[Shutdown] Error during drain:", err);
    exitCode = 1;
  }

  clearTimeout(watchdog);
  process.exit(exitCode);
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err);
  shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
  shutdown("unhandledRejection", 1);
});
