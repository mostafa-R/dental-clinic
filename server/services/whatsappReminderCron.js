import cron from "node-cron";
import mongoose from "mongoose";

import Appointment from "../modules/appointments/appointment.model.js";
import WhatsAppSetting from "../modules/whatsapp/whatsappSetting.model.js";
import Patient from "../modules/patients/patient.model.js";
import Branch from "../modules/users/branch.model.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

const REMINDER_CHECK_INTERVAL = "*/30 * * * *";
// Egypt weekend (Fri/Sat): the 24h reminder for a weekend appointment is
// shifted a full day earlier so it lands on the preceding workday (PRD §6.4).
const WEEKEND_DAYS = [5, 6]; // getDay(): 5=Friday, 6=Saturday
const WINDOW_TOLERANCE_MS = 30 * 60 * 1000;

function buildMessage(patient, appointment, type) {
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

  if (type === "reminder" || type === "reminder24") {
    return `تذكير موعد عيادة الأسنان 🦷\n\nمرحباً ${patient.firstName}،\nنذكرك بموعدك في عيادتنا:\n📅 ${day}\n🕒 ${time}\n\nنتمنى لك يوماً سعيداً.`;
  }

  if (type === "confirm") {
    return `تأكيد موعد عيادة الأسنان ✅\n\nمرحباً ${patient.firstName}،\nتم تأكيد موعدك:\n📅 ${day}\n🕒 ${time}\n\nيرجى الحضور قبل الموعد بـ 10 دقائق.\nشكراً لك.`;
  }

  return "";
}

/**
 * PRD §6.4 default schedule: reminders go out `reminderHours` before the
 * appointment AND `reminderHoursSecondary` hours before (default 24h).
 * Appointments falling on the weekend use the secondary window +24h so the
 * notice arrives on a workday.
 */
async function sendMessagesForTenant(settings, type) {
  const tenantId = settings.tenant;
  const isReminder = type === "reminder";
  const isReminder24 = type === "reminder24";

  // The short-window reminder uses settings.reminderHours; the long window
  // uses settings.reminderHoursSecondary (0 disables it — handled by caller).
  let hoursAhead = settings.settings?.reminderHours || 2;
  if (isReminder24) {
    hoursAhead = settings.settings?.reminderHoursSecondary ?? 24;
  }

  const now = new Date();
  let windowStart = now;
  let windowEnd = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  if (isReminder) {
    // Short window: appointments starting within [now, now + reminderHours].
    windowEnd = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  } else if (isReminder24) {
    // Long window targets the exact hour band around (start − hoursAhead):
    // with a 30-min cron, a ±30 min band fires exactly once per appointment.
    windowStart = new Date(now.getTime() + (hoursAhead - 1) * 60 * 60 * 1000);
    windowEnd = new Date(now.getTime() + (hoursAhead + 1) * 60 * 60 * 1000);
  } else {
    // Confirmations: appointments confirmed within the last hour or upcoming.
    windowStart = new Date(now.getTime() - 60 * 60 * 1000);
  }

  const branches = await Branch.find({ tenant: tenantId }).select("_id").lean();
  const branchIds = branches.map((b) => b._id);
  if (branchIds.length === 0) return;

  const filterField = isReminder
    ? "reminderSentAt"
    : isReminder24
      ? "secondaryReminderSentAt"
      : "confirmSentAt";
  const statuses = isReminder || isReminder24
    ? { $in: ["scheduled", "confirmed"] }
    : "confirmed";

  const appointments = await Appointment.find({
    branch: { $in: branchIds },
    status: statuses,
    start: { $gte: windowStart, $lte: windowEnd },
    [filterField]: null,
  })
    .populate("patient", "firstName phone")
    .lean();

  // Weekend shift for the 24h reminder: appointments landing Fri/Sat are
  // reminded 48h ahead instead of 24h (message arrives on the workday).
  let eligible = appointments.filter((apt) => apt.patient?.phone);
  if (isReminder24 && hoursAhead > 0) {
    eligible = eligible.filter((apt) => {
      const day = new Date(apt.start).getDay();
      const shiftedHours = WEEKEND_DAYS.includes(day) ? hoursAhead + 24 : hoursAhead;
      const target = new Date(apt.start).getTime() - shiftedHours * 60 * 60 * 1000;
      return Math.abs(target - now.getTime()) <= WINDOW_TOLERANCE_MS;
    });
  }

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
            `[WhatsApp-${type}] Sent to ${apt.patient.firstName} (${apt.patient.phone}) for appointment ${apt._id}`,
          );
        } catch (err) {
          console.error(
            `[WhatsApp-${type}] Failed for appointment ${apt._id}: ${err.message}`,
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

    const jobs = [];
    for (const s of activeSettings) {
      jobs.push(sendMessagesForTenant(s, "reminder"));
      // PRD §6.4: second reminder window (default 24h). A value of 0 opts out.
      if ((s.settings?.reminderHoursSecondary ?? 24) > 0) {
        jobs.push(sendMessagesForTenant(s, "reminder24"));
      }
    }
    await Promise.allSettled(jobs);

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
