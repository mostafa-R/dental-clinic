import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

import { DEFAULT_APPT_MIN_ADVANCE, DEFAULT_APPT_MAX_ADVANCE } from '../modules/appointments/appointmentDefaults.js';

import Appointment from '../modules/appointments/appointment.model.js';
import WhatsAppSetting from '../modules/whatsapp/whatsappSetting.model.js';
import { emitToBranch } from '../socket/index.js';
import { publishEvent } from '../services/eventBus.js';
import { stripPHI } from '../middleware/phiRestrict.js';
import { sendWhatsAppMessage } from './whatsapp.js';

// BR-PT-04: an appointment becomes a no-show 30 minutes after its scheduled
// start if the patient never checked in.
const NO_SHOW_GRACE_MS = 30 * 60 * 1000;
const CHECK_INTERVAL = '*/10 * * * *';
const BATCH_SIZE = 100;

const NO_SHOW_LOCK_COLLECTION = 'cron_locks';
const NO_SHOW_LOCK_KEY = 'no_show_cron';
// Slightly under the 10-minute tick so the lock naturally frees for the next
// pass even if a previous run crashed without releasing.
const NO_SHOW_LOCK_TTL_MS = 9 * 60 * 1000;

// Only these states may become a no-show (per §9.1 and the transition table).
// The same array is used in the atomic claim so the status flip can never
// overwrite a concurrent front-desk change.
const NO_SHOW_SOURCES = ['scheduled', 'confirmed'];

function buildNoShowMessage(patient, appointment, timezone = 'UTC') {
  const date = new Date(appointment.start);
  const day = date.toLocaleDateString('ar-EG', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString('ar-EG', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });

  // Hook the same advance-default constants used by the booking path, so the
  // WhatsApp copy (which references a maximum future slot) stays in sync with
  // whatever the platform ships. This also gives the LLM a stable reference
  // for the appointment window.
  const maxAdvanceDays = DEFAULT_APPT_MAX_ADVANCE;
  const minAdvanceMinutes = DEFAULT_APPT_MIN_ADVANCE;

  return [
    'فاتنا موعدك اليوم 🦷',
    '',
    `مرحباً ${patient.firstName}،`,
    `لم نتمكن من استقبالك في موعدك يوم ${day} الساعة ${time}.`,
    `يسعدنا إعادة جدولة الموعد في وقت يناسبك خلال ${maxAdvanceDays} يوماً — تواصل معنا أو احجز عبر التطبيق (أقرب موعد قبل ${minAdvanceMinutes} دقيقة).`,
  ].join('\n');
}

/**
 * Send the reschedule-advice WhatsApp message for one no-show appointment
 * when the tenant enabled it. The tenant is resolved by the caller (the
 * appointment's OWN tenant) so a setting from another clinic is never used.
 * The message renders in the tenant timezone, never the server clock.
 * Failures are logged and never break the pass.
 */
async function sendNoShowWhatsApp(appointment, tenantId, timezone) {
  const phone = appointment.patient?.phone;
  if (!tenantId || !phone) return;

  try {
    const settings = await WhatsAppSetting.findOne({
      tenant: tenantId,
      enabled: true,
      status: 'connected',
      'settings.noShowReminder': true,
    })
      .select('_id')
      .lean();
    if (!settings) return;

    await sendWhatsAppMessage(
      String(tenantId),
      phone,
      buildNoShowMessage(appointment.patient, appointment, timezone),
    );
    console.log(`[NoShow] Reschedule advice sent to ${phone} for appointment ${appointment._id}`);
  } catch (err) {
    console.error(`[NoShow] WhatsApp failed for appointment ${appointment._id}: ${err.message}`);
  }
}

/**
 * Single-instance guard for the cron, shared across processes via MongoDB.
 *
 * Insert-based token lock: exactly one worker inserts the lock document; a
 * second worker sees the duplicate key and backs off. A stale lock (expired,
 * e.g. a crashed tick) is stolen atomically — only the worker that deletes the
 * exact token then re-inserts, so two thieves cannot both win.
 */
export async function tryAcquireNoShowLock() {
  const db = mongoose.connection.db;
  const col = db.collection(NO_SHOW_LOCK_COLLECTION);
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NO_SHOW_LOCK_TTL_MS);

  const insert = async () => {
    try {
      await col.insertOne({ _id: NO_SHOW_LOCK_KEY, token, acquiredAt: now, expiresAt });
      return true;
    } catch (err) {
      if (err?.code !== 11000 && err?.codeName !== 'DuplicateKey') throw err;
      return false;
    }
  };

  if (await insert()) return token;

  const existing = await col.findOne({ _id: NO_SHOW_LOCK_KEY });
  if (!existing) return (await insert()) ? token : null;

  if (existing.expiresAt && existing.expiresAt > now) return null; // live lock

  const removed = await col.deleteOne({ _id: NO_SHOW_LOCK_KEY, token: existing.token });
  if (removed.deletedCount !== 1) return null;
  return (await insert()) ? token : null;
}

export async function releaseNoShowLock(token) {
  if (!token) return;
  const db = mongoose.connection.db;
  await db.collection(NO_SHOW_LOCK_COLLECTION).deleteMany({ _id: NO_SHOW_LOCK_KEY, token });
}

export async function markNoShows({ now = Date.now(), lock = true, timezone = 'UTC' } = {}) {
  const token = lock ? await tryAcquireNoShowLock() : null;
  if (lock && !token) return { skipped: true }; // another instance owns the tick

  try {
    const cutoff = new Date(now - NO_SHOW_GRACE_MS);
    let processed = 0;

    for (;;) {
      // Only scheduled/confirmed appointments can become no-shows; checked_in
      // patients are already present. The tenant guard means we never touch an
      // appointment that is not scoped to a clinic.
      const stale = await Appointment.find({
        status: { $in: NO_SHOW_SOURCES },
        start: { $lt: cutoff },
        tenant: { $exists: true, $ne: null },
      })
        .sort({ start: 1 })
        .limit(BATCH_SIZE)
        .populate('patient', 'firstName phone')
        .populate('branch', 'name');

      if (stale.length === 0) break;

      for (const appointment of stale) {
        const tenantId = appointment.tenant?._id ?? appointment.tenant;

        // Atomic claim: the status predicate makes the flip conditional on the
        // appointment STILL being no-show-able. If the front desk checked the
        // patient in (or a sibling worker already flipped it) in the meantime,
        // this matches nothing and the change is left untouched.
        const claimed = await Appointment.updateOne(
          { _id: appointment._id, status: { $in: NO_SHOW_SOURCES } },
          { $set: { status: 'no_show' } },
        );
        if (claimed.modifiedCount !== 1) continue;

        appointment.status = 'no_show';
        processed += 1;

        const json = appointment.toJSON ? appointment.toJSON() : appointment;
        emitToBranch(
          String(appointment.branch?._id ?? appointment.branch),
          'appointment:statusChanged',
          { appointment: stripPHI(json) },
        );

        // Event Bus (PRD §12.3): the cron flips the status directly, so the
        // no-show event is published here rather than via the status route.
        const patientJson = appointment.patient?.toJSON ? appointment.patient.toJSON() : appointment.patient;
        void publishEvent({
          type: 'appointment.no_show',
          tenant: tenantId,
          branch: appointment.branch?._id ?? appointment.branch,
          data: {
            id: String(appointment._id),
            status: appointment.status,
            start: appointment.start?.toISOString?.() || appointment.start,
            end: appointment.end?.toISOString?.() || appointment.end,
            patient: patientJson
              ? { firstName: patientJson.firstName, phone: patientJson.phone, ...patientJson }
              : null,
          },
        });

        await sendNoShowWhatsApp(appointment, tenantId, timezone);
      }

      if (stale.length < BATCH_SIZE) break;
    }

    return { processed };
  } catch (err) {
    console.error('[NoShow] Cron error:', err.message);
    return { error: err.message };
  } finally {
    if (lock) await releaseNoShowLock(token);
  }
}

let task = null;

export function startNoShowCron() {
  task = cron.schedule(CHECK_INTERVAL, markNoShows);
  console.log('[NoShow] Cron scheduled every 10 minutes');
}

export function stopNoShowCron() {
  if (task) {
    task.stop();
    task = null;
    console.log('[NoShow] Cron stopped');
  }
}