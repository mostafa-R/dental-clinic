import cron from "node-cron";
import mongoose from "mongoose";

import Appointment from "../modules/appointments/appointment.model.js";
import WhatsAppSetting from "../modules/whatsapp/whatsappSetting.model.js";
import Patient from "../modules/patients/patient.model.js";
import Branch from "../modules/users/branch.model.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

const REMINDER_CHECK_INTERVAL = "*/30 * * * *";

async function buildMessage(patient, appointment, type) {
  const date = new Date(appointment.start);
  const day = date.toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (type === "reminder") {
    return `تذكير موعد عيادة الأسنان 🦷\n\nمرحباً ${patient.firstName}،\nنذكرك بموعدك في عيادتنا:\n📅 ${day}\n🕒 ${time}\n\nنتمنى لك يوماً سعيداً.`;
  }

  if (type === "confirm") {
    return `تأكيد موعد عيادة الأسنان ✅\n\nمرحباً ${patient.firstName}،\nتم تأكيد موعدك:\n📅 ${day}\n🕒 ${time}\n\nيرجى الحضور قبل الموعد بـ 10 دقائق.\nشكراً لك.`;
  }

  return "";
}

async function sendMessagesForTenant(settings, type) {
  const tenantId = settings.tenant;
  const isReminder = type === "reminder";
  const reminderHours = settings.settings?.reminderHours || 2;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);
  const windowStart = isReminder ? now : new Date(now.getTime() - 60 * 60 * 1000);

  const branches = await Branch.find({ tenant: tenantId }).select("_id").lean();
  const branchIds = branches.map((b) => b._id);
  if (branchIds.length === 0) return;

  const filterField = isReminder ? "reminderSentAt" : "confirmSentAt";

  const appointments = await Appointment.find({
    branch: { $in: branchIds },
    status: isReminder ? { $in: ["scheduled", "confirmed"] } : "confirmed",
    start: isReminder ? { $gte: now, $lte: windowEnd } : { $gte: windowStart, $lte: windowEnd },
    [filterField]: null,
  })
    .populate("patient", "firstName phone")
    .lean();

  const eligible = appointments.filter((apt) => apt.patient?.phone);

  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 2000;
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (apt) => {
        try {
          const message = await buildMessage(apt.patient, apt, type);
          await sendWhatsAppMessage(String(tenantId), apt.patient.phone, message);
          await Appointment.findByIdAndUpdate(apt._id, { [filterField]: new Date() });
          console.log(
            `[WhatsApp-${type === "reminder" ? "Reminder" : "Confirm"}] Sent to ${apt.patient.firstName} (${apt.patient.phone}) for appointment ${apt._id}`,
          );
        } catch (err) {
          console.error(
            `[WhatsApp-${type === "reminder" ? "Reminder" : "Confirm"}] Failed for appointment ${apt._id}: ${err.message}`,
          );
        }
      }),
    );
    // Delay between batches to avoid WhatsApp rate limits.
    if (i + BATCH_SIZE < eligible.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
}

async function processReminders() {
  try {
    const activeSettings = await WhatsAppSetting.find({
      enabled: true,
      status: "connected",
      "settings.appointmentReminder": true,
    }).lean();

    const reminderPromises = activeSettings.map((s) => sendMessagesForTenant(s, "reminder"));
    await Promise.allSettled(reminderPromises);

    // Delay between tenant batches to avoid cross-tenant rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const confirmSettings = await WhatsAppSetting.find({
      enabled: true,
      status: "connected",
      "settings.appointmentConfirm": true,
    }).lean();

    const confirmPromises = confirmSettings.map((s) => sendMessagesForTenant(s, "confirm"));
    await Promise.allSettled(confirmPromises);
  } catch (err) {
    console.error("[WhatsApp-Reminder] Cron error:", err.message);
  }
}

let reminderTask = null;

export function startWhatsAppReminderCron() {
  reminderTask = cron.schedule(REMINDER_CHECK_INTERVAL, processReminders);
  console.log("[WhatsApp-Reminder] Cron scheduled every 30 minutes");
}

export function stopWhatsAppReminderCron() {
  if (reminderTask) {
    reminderTask.stop();
    reminderTask = null;
    console.log("[WhatsApp-Reminder] Cron stopped");
  }
}
