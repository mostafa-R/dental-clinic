/*
 * Production-like WhatsApp Web verification.
 *
 * Unlike __tests__/whatsapp.test.js (which mocks whatsapp-web.js), this script
 * exercises the REAL service path against the REAL MongoDB, a REAL Chromium
 * (puppeteer's bundled Chrome) and the live web.whatsapp.com site. It drives
 * the pairing flow up to the point where WhatsApp issues a QR code — the last
 * step that can be automated without a physical phone.
 *
 * Usage (from server/):
 *   node scripts/verify-whatsapp-live.js
 *
 * Exit code 0 = browser launched, WhatsApp Web loaded, QR persisted by the
 * service. Pairing itself still requires a human scanning the QR.
 */
import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";

function findBundledChrome() {
  const cache = path.join(os.homedir(), ".cache", "puppeteer", "chrome");
  if (!existsSync(cache)) return null;
  for (const dir of readdirSync(cache)) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-linux64/chrome", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"]) {
      const p = path.join(cache, dir, exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const chromePath = process.env.CHROME_PATH || findBundledChrome();
if (!chromePath) {
  console.error("FAIL: no Chrome found (set CHROME_PATH or run `npx puppeteer browsers install chrome`).");
  process.exit(2);
}
process.env.WHATSAPP_DEFAULT_COUNTRY ||= "20";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_whatsapp_live";
const WAIT_MS = Number(process.env.WA_LIVE_TIMEOUT_MS || 120000);
const started = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[live] chrome: ${process.env.CHROME_PATH ? `CHROME_PATH=${process.env.CHROME_PATH}` : `service auto-detect -> ${chromePath}`}`);
  console.log(`[live] mongo:  ${MONGO_URI}`);

  const { connectWhatsApp, disconnectAllWhatsAppClients, getWhatsAppStatus } = await import("../services/whatsapp.js");
  const { default: WhatsAppSetting } = await import("../modules/whatsapp/whatsappSetting.model.js");

  await mongoose.connect(MONGO_URI);

  const tenantId = new mongoose.Types.ObjectId();
  const authDir = path.join(process.cwd(), ".wwebjs_auth");

  let ok = false;
  try {
    await WhatsAppSetting.deleteMany({ tenant: tenantId });
    await WhatsAppSetting.create({
      tenant: tenantId,
      enabled: true,
      provider: "whatsapp_web",
      config: { phoneNumber: "201000000000" },
    });

    const connectPromise = connectWhatsApp(tenantId);

    let qrCode = "";
    while (Date.now() - started < WAIT_MS) {
      const setting = await WhatsAppSetting.findOne({ tenant: tenantId }).select("+qrCode").lean();
      if (setting?.qrCode) qrCode = setting.qrCode;
      if (qrCode) break;
      await sleep(2000);
    }

    await connectPromise.catch((err) => {
      throw new Error(`connectWhatsApp failed: ${err.message}`);
    });

    const status = await getWhatsAppStatus(tenantId);

    if (!qrCode) throw new Error("WhatsApp Web never produced a QR code within the timeout");

    console.log(`[live] status: ${JSON.stringify(status)}`);
    console.log(`[live] qr data-url length: ${qrCode.length}`);
    if (!qrCode.startsWith("data:image/")) throw new Error("stored qrCode is not a data:image URL");

    ok = true;
  } finally {
    await disconnectAllWhatsAppClients().catch(() => {});
    await WhatsAppSetting.deleteMany({ tenant: tenantId }).catch(() => {});
    await mongoose.disconnect().catch(() => {});
    await rm(authDir, { recursive: true, force: true }).catch(() => {});
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(ok ? `\nPASS: reached QR stage against live WhatsApp Web in ${secs}s` : `\nFAIL after ${secs}s`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nFAIL: ${err.message}`);
  process.exit(1);
});