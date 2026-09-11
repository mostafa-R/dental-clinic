import Appointment from "../modules/appointments/appointment.model.js";
import WhatsAppSetting from "../modules/whatsapp/whatsappSetting.model.js";
import TreatmentPlan from "../modules/emr/treatmentPlan.model.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import { isAutomationTemplateEnabled } from "./automationEngine.js";
import { publishEvent } from "./eventBus.js";
import {
  computePosition,
  computeAvgSessionMinutes,
  isSameClinicDay,
  positionDecision as purePositionDecision,
  QUEUE_ACTIVE_STATUSES,
} from "./queueEngine.js";
import { loadTenantTimezone } from "../utils/timezoneUtils.js";
import { zonedTodayRangeUtc } from "../utils/zonedDates.js";

// ---------------------------------------------------------------------------
// Dedup / guard key constants — must match DEFAULT_TEMPLATES keys in
// constants/automations.js so the "built-in sender skips when template is
// enabled" pattern (cf. noShowCron §85-88) is preserved.
// ---------------------------------------------------------------------------
const TEMPLATE_KEY = {
  joined: "queue-joined",
  position: "queue-position",
  nearTurn: "queue-near-turn",
  turnNow: "queue-turn-now",
  // The completed-visit built-in (summary + next appointment) is suppressed
  // only when the clinic enabled the pre-existing post-visit survey template;
  // otherwise the patient would receive two different "completed" messages.
  completed: "post-visit-survey",
};

// Average session duration cache: Map<doctorId, { avg, at }>.
// Refreshed once per scan so repeated lookups in the same tick are free.
const AVG_SESSION_CACHE_TTL_MS = 10 * 60 * 1000;
const avgSessionCache = new Map();

async function cachedAvgSession(tenantId, doctorId) {
  const key = String(doctorId);
  const hit = avgSessionCache.get(key);
  if (hit && Date.now() - hit.at < AVG_SESSION_CACHE_TTL_MS) return hit.avg;

  const records = await Appointment.find({
    tenant: tenantId,
    doctor: doctorId,
    status: "completed",
    start: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  })
    .select("start end")
    .lean();

  const avg = computeAvgSessionMinutes(records);
  avgSessionCache.set(key, { avg, at: Date.now() });
  return avg;
}

// ---------------------------------------------------------------------------
// Message builders (exported for unit tests)
// ---------------------------------------------------------------------------
export function buildJoinedMessage({ firstName, doctorName, queueNumber, patientsAhead }) {
  const peopleWord = patientsAhead === 1 ? "مريض" : "مرضى";
  const lines = [
    "تم تأكيد حجزك اليوم ✅",
    "",
    `مرحباً ${firstName}،`,
    `موعدك اليوم في عيادتنا مع د. ${doctorName}.`,
    "",
    `🔢 رقمك في الدور: ${queueNumber}`,
    `👥 يوجد أمامك حاليًا: ${patientsAhead} ${peopleWord}`,
    "",
    "سنخبرك عند اقتراب دورك 🦷",
  ];
  return lines.join("\n");
}

export function buildPositionMessage({ firstName, patientsAhead }) {
  const lines = [
    "تحديث الدور 🦷",
    "",
    `مرحباً ${firstName}،`,
    `أصبح عدد المرضى أمامك: ${patientsAhead}.`,
    "",
    "الرجاء الاستعداد للحضور لما يصل دورك.",
  ];
  return lines.join("\n");
}

export function buildNearTurnMessage({ firstName, patientsAhead, estimatedWaitMinutes }) {
  const lines = [
    "دورك اقترب 🦷",
    "",
    `مرحباً ${firstName}،`,
    `وقت الانتظار المتوقع حوالي ${estimatedWaitMinutes} دقيقة.`,
    `يوجد أمامك حاليًا: ${patientsAhead}.`,
    "",
    "الرجاء الاقتراب من العيادة إن أمكن 🌟",
  ];
  return lines.join("\n");
}

export function buildTurnNowMessage({ firstName, doctorName }) {
  const lines = [
    "حان دورك الآن 🦷",
    "",
    `مرحباً ${firstName}،`,
    `برجاء التوجه إلى غرفة د. ${doctorName} الآن.`,
    "شكرًا لانتظارك ❤️",
  ];
  return lines.join("\n");
}

export function buildCompletedMessage({ firstName, doctorName, summaryLines, nextAppointment }) {
  const nextText = nextAppointment
    ? `${nextAppointment.dayStr} الساعة ${nextAppointment.timeStr}`
    : "سيتم تحديده من عيادتنا — سيتواصل معك أحد فريقنا.";

  const lines = [
    "شكرًا لزيارتك ❤️",
    "",
    `مرحباً ${firstName}،`,
    `انتهت زيارتك اليوم مع د. ${doctorName}.`,
    "",
    "📄 ملخص الزيارة:",
    ...summaryLines.map((l) => `  • ${l}`),
    "",
    "📅 موعدك القادم:",
    nextText,
    "",
    "سنرسل لك تذكيرًا قبل الموعد.",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Visit summary helper — lightweight; avoids pulling the full EMR.
// ---------------------------------------------------------------------------
async function buildVisitSummary(patientId, appointmentReason) {
  const plans = await TreatmentPlan.find({ patient: patientId })
    .sort("-updatedAt")
    .limit(1)
    .select("items.procedureName")
    .lean();

  const procedureNames = (plans?.[0]?.items || [])
    .map((i) => i.procedureName)
    .filter(Boolean)
    .slice(0, 5);

  if (procedureNames.length > 0) return procedureNames;

  if (appointmentReason) return [appointmentReason];
  return ["تم إكمال زيارتك في عيادتنا."];
}

function formatFollowUpDate(appointment, tz) {
  const d = new Date(appointment.start);
  const dayStr = d.toLocaleDateString("ar-EG", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeStr = d.toLocaleTimeString("ar-EG", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
  return { dayStr, timeStr };
}

// ---------------------------------------------------------------------------
// Shared send + gate helpers
// ---------------------------------------------------------------------------

async function isChannelReady(tenantId) {
  const s = await WhatsAppSetting.findOne({
    tenant: tenantId,
    enabled: true,
    status: "connected",
    "settings.queueNotifications": true,
  })
    .select("_id")
    .lean();
  return !!s;
}

async function isTemplateActive(tenantId, key) {
  return isAutomationTemplateEnabled(tenantId, key);
}

function getPhone(appointment) {
  return appointment?.patient?.phone || null;
}

function publishQueueEvent(tenantId, branchId, type, data) {
  void publishEvent({ type, tenant: tenantId, branch: branchId, data });
}

function serializePayload(appointment, extra = {}) {
  const pid = appointment.patient?._id || appointment.patient;
  const doc = appointment.doctor?._id || appointment.doctor;
  return {
    appointmentId: String(appointment._id),
    patient: {
      id: String(pid),
      firstName: appointment.patient?.firstName || "",
      phone: appointment.patient?.phone || "",
    },
    doctor: {
      id: String(doc),
      name: appointment.doctor?.name || "",
    },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Flow 1 — queue.joined (same-day booking only)
// ---------------------------------------------------------------------------
export async function notifyQueueJoined(appointment) {
  try {
    const tenantId = appointment.tenant;
    if (!tenantId) return;
    if (appointment.queueJoinedNotifiedAt) return; // idempotent

    const tz = await loadTenantTimezone(tenantId);
    if (!isSameClinicDay(appointment.start, tz)) return;

    // Ensure doctor is populated (the create route uses POPULATE; belt-and-
    // suspenders for callers that might pass a lean doc).
    if (!appointment.doctor?.name) {
      await appointment.populate?.("doctor", "name");
    }
    if (!appointment.patient?.firstName) {
      await appointment.populate?.("patient", "firstName phone");
    }

    const { queueNumber, patientsAhead } = await computePosition(appointment, { tz });

    // Persist the snapshot so the board / dashboard can show it immediately.
    await Appointment.findByIdAndUpdate(appointment._id, { $set: { queueNumber } });

    // ---- Delivery ----
    const phone = getPhone(appointment);
    publishQueueEvent(tenantId, appointment.branch, "queue.joined", {
      ...serializePayload(appointment, { queueNumber, patientsAhead }),
    });

    if (await isTemplateActive(tenantId, TEMPLATE_KEY.joined)) return; // automation sends

    if (phone && (await isChannelReady(tenantId))) {
      const message = buildJoinedMessage({
        firstName: appointment.patient.firstName,
        doctorName: appointment.doctor?.name || "",
        queueNumber,
        patientsAhead,
      });
      await sendWhatsAppMessage(String(tenantId), phone, message);
    }

    await Appointment.findByIdAndUpdate(appointment._id, {
      $set: {
        queueJoinedNotifiedAt: new Date(),
        lastQueueAheadNotified: patientsAhead,
        queueNumber,
      },
    });
  } catch (err) {
    console.error(`[Queue] Joined notify failed for ${appointment._id}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Flow 4 — queue.turn_now  (called from controller / queue call-next)
// ---------------------------------------------------------------------------
export async function notifyTurnNow(appointment) {
  try {
    const tenantId = appointment.tenant;
    if (!tenantId) return;
    if (appointment.turnNotifiedAt) return;

    if (!appointment.doctor?.name) {
      await appointment.populate?.("doctor", "name");
    }
    if (!appointment.patient?.firstName) {
      await appointment.populate?.("patient", "firstName phone");
    }

    publishQueueEvent(tenantId, appointment.branch, "queue.turn_now", {
      ...serializePayload(appointment),
    });

    if (await isTemplateActive(tenantId, TEMPLATE_KEY.turnNow)) return;

    const phone = getPhone(appointment);
    if (phone && (await isChannelReady(tenantId))) {
      const message = buildTurnNowMessage({
        firstName: appointment.patient.firstName,
        doctorName: appointment.doctor?.name || "",
      });
      await sendWhatsAppMessage(String(tenantId), phone, message);
    }

    await Appointment.findByIdAndUpdate(appointment._id, { $set: { turnNotifiedAt: new Date() } });
  } catch (err) {
    console.error(`[Queue] Turn-now notify failed for ${appointment._id}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Flow 5 — appointment.completed  (visit summary + next appointment)
// ---------------------------------------------------------------------------
export async function notifyVisitCompleted(appointment, { nextAppointmentId, summaryLines } = {}) {
  try {
    const tenantId = appointment.tenant;
    if (!tenantId) return;
    if (appointment.completedSummarySentAt) return;

    if (!appointment.doctor?.name) {
      await appointment.populate?.("doctor", "name");
    }
    if (!appointment.patient?.firstName) {
      await appointment.populate?.("patient", "firstName phone");
    }

    const tz = await loadTenantTimezone(tenantId);

    const summary =
      summaryLines && summaryLines.length > 0
        ? summaryLines
        : await buildVisitSummary(appointment.patient?._id || appointment.patient, appointment.reason);

    let nextAppointment = null;
    const nextId = nextAppointmentId || appointment.nextAppointmentId;
    if (nextId) {
      const next = await Appointment.findById(nextId).select("start").lean();
      if (next?.start) nextAppointment = formatFollowUpDate(next, tz);
    }

    publishQueueEvent(tenantId, appointment.branch, "appointment.completed", {
      ...serializePayload(appointment, { summaryLines: summary, nextAppointment }),
    });

    if (await isTemplateActive(tenantId, TEMPLATE_KEY.completed)) return;

    const phone = getPhone(appointment);
    if (phone && (await isChannelReady(tenantId))) {
      const message = buildCompletedMessage({
        firstName: appointment.patient.firstName,
        doctorName: appointment.doctor?.name || "",
        summaryLines: summary,
        nextAppointment,
      });
      await sendWhatsAppMessage(String(tenantId), phone, message);
    }

    await Appointment.findByIdAndUpdate(appointment._id, {
      $set: { completedSummarySentAt: new Date(), nextAppointmentId: nextId || null },
    });
  } catch (err) {
    console.error(`[Queue] Completed notify failed for ${appointment._id}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Periodic scanner: position_changed  +  near_turn  (flow 2 & 3)
// ---------------------------------------------------------------------------
export async function scanAndNotifyQueuePositions() {
  const activeTenants = await WhatsAppSetting.find({
    enabled: true,
    status: "connected",
    "settings.queueNotifications": true,
  })
    .select("tenant")
    .lean();

  for (const { tenant } of activeTenants) {
    await processTenantQueuePositions(tenant);
  }
}

async function processTenantQueuePositions(tenantId) {
  const tz = await loadTenantTimezone(tenantId);
  const range = zonedTodayRangeUtc(Date.now(), tz);
  if (!range) return;

  const appointments = await Appointment.find({
    tenant: tenantId,
    start: { $gte: range.start, $lt: range.end },
    status: { $in: QUEUE_ACTIVE_STATUSES },
  })
    .populate("patient", "firstName phone")
    .populate("doctor", "name")
    .sort({ branch: 1, doctor: 1, start: 1, createdAt: 1 })
    .lean();

  if (appointments.length === 0) return;

  // Group by branch:doctor and compute positions by sort order.
  const groups = new Map();
  for (const apt of appointments) {
    const key = `${String(apt.branch)}:${String(apt.doctor)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(apt);
  }

  for (const [, group] of groups) {
    const doctorId = group[0].doctor?._id || group[0].doctor;
    const avg = await cachedAvgSession(tenantId, doctorId);

    for (let idx = 0; idx < group.length; idx += 1) {
      const apt = group[idx];
      const ahead = idx;
      const wait = Math.round(ahead * avg);
      const nearDue = ahead <= 3 && wait <= 90;
      const { sendPosition, sendNearTurn } = purePositionDecision({
        nextAhead: ahead,
        lastNotifiedAhead: apt.lastQueueAheadNotified,
        nearTurnAlreadyNotified: !!apt.nearTurnNotifiedAt,
        nearTurnDue: nearDue,
      });

      if (sendPosition) {
        await firePositionUpdate(tenantId, apt, { queueNumber: idx + 1, patientsAhead: ahead });
      }
      if (sendNearTurn) {
        await fireNearTurn(tenantId, apt, { patientsAhead: ahead, estimatedWaitMinutes: wait });
      }
    }
  }
}

async function firePositionUpdate(tenantId, apt, { queueNumber, patientsAhead }) {
  publishQueueEvent(tenantId, apt.branch, "queue.position_changed", {
    ...serializePayload(apt, { queueNumber, patientsAhead }),
  });

  if (await isTemplateActive(tenantId, TEMPLATE_KEY.position)) return;

  const phone = getPhone(apt);
  if (phone && (await isChannelReady(tenantId))) {
    const message = buildPositionMessage({
      firstName: apt.patient?.firstName,
      patientsAhead,
    });
    await sendWhatsAppMessage(String(tenantId), phone, message);
  }

  await Appointment.findByIdAndUpdate(apt._id, {
    $set: { lastQueueAheadNotified: patientsAhead },
  });
}

async function fireNearTurn(tenantId, apt, { patientsAhead, estimatedWaitMinutes }) {
  publishQueueEvent(tenantId, apt.branch, "queue.near_turn", {
    ...serializePayload(apt, { patientsAhead, estimatedWaitMinutes }),
  });

  if (await isTemplateActive(tenantId, TEMPLATE_KEY.nearTurn)) return;

  const phone = getPhone(apt);
  if (phone && (await isChannelReady(tenantId))) {
    const message = buildNearTurnMessage({
      firstName: apt.patient?.firstName,
      patientsAhead,
      estimatedWaitMinutes,
    });
    await sendWhatsAppMessage(String(tenantId), phone, message);
  }

  await Appointment.findByIdAndUpdate(apt._id, {
    $set: {
      lastQueueAheadNotified: patientsAhead,
      nearTurnNotifiedAt: new Date(),
    },
  });
}