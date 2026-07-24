import http from "node:http";

import app, { upgradeRateLimitStore } from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { getIO, initSocket } from "./socket/index.js";
import { startSuspensionCron, stopSuspensionCron } from "./services/suspensionCron.js";
import { startAbuseCron, stopAbuseCron, stopAbuseFlusher } from "./services/abuseDetection.js";
import { startWhatsAppReminderCron, stopWhatsAppReminderCron } from "./services/whatsappReminderCron.js";
import { startBackupCron, stopBackupCron } from "./services/backupCron.js";
import { startInstallmentCron, stopInstallmentCron } from "./services/installmentCron.js";
import { disconnectAllWhatsAppClients } from "./services/whatsapp.js";
import { runMigrations } from "./migrations/runner.js";

const PORT = Number(process.env.PORT || 5000);

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
}

async function start() {
  validateEnv();

  await connectDB();
  await runMigrations().catch((err) => {
    console.error('[Migrations] Migration failed:', err.message);
  });
  await connectRedis();
  await upgradeRateLimitStore();

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  startSuspensionCron();
  startAbuseCron();
  startWhatsAppReminderCron();
  startBackupCron();
  startInstallmentCron();

  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    stopSuspensionCron();
    stopAbuseCron();
    stopAbuseFlusher();
    stopWhatsAppReminderCron();
    stopBackupCron();
    stopInstallmentCron();

    await disconnectAllWhatsAppClients();

    const io = getIO();
    if (io) io.close();

    await disconnectRedis();
    await disconnectDB();

    httpServer.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(0);
    }, 15000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
  process.exit(1);
});
