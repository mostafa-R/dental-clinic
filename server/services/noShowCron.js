import cron from 'node-cron';

import Appointment from '../modules/appointments/appointment.model.js';
import WhatsAppSetting from '../modules/whatsapp/whatsappSetting.model.js';
import { emitToBranch } from '../socket/index.js';
import { sendWhatsAppMessage } from './whatsapp.js';

// BR-PT-04: an appointment becomes a no-show 30 minutes after its scheduled
// start if the patient never checked in.
const NO_SHOW_GRACE_MS = 30 * 60 * 1000;
const CHECK_INTERVAL = '*/10 * * * *';
const BATCH_SIZE = 100;

function buildNoShowMessage(patient, appointment) {
  const date = new Date(appointment.start);
  const day = date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  return [
    'فاتنا موعدك اليوم 🦷',
    '',
    `مرحباً ${patient.firstName}،`,
    `لم نتمكن من استقبالك في موعدك يوم ${day} الساعة ${time}.`,
    'يسعدنا إعادة جدولة الموعد في وقت يناسبك — تواصل معنا أو احجز عبر التطبيق.',
  ].join('\n');
}

/**
 * Send the reschedule-advice WhatsApp message for one no-show appointment
 * when the tenant enabled it. Failures are logged and never break the pass.
 */
async function sendNoShowWhatsApp(appointment) {
  const tenantId = appointment.tenant?._id ?? appointment.tenant;
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
      buildNoShowMessage(appointment.patient, appointment),
    );
    console.log(`[NoShow] Reschedule advice sent to ${phone} for appointment ${appointment._id}`);
  } catch (err) {
    console.error(`[NoShow] WhatsApp failed for appointment ${appointment._id}: ${err.message}`);
  }
}

export async function markNoShows() {
  try {
    const cutoff = new Date(Date.now() - NO_SHOW_GRACE_MS);

    for (;;) {
      // Only scheduled/confirmed appointments can become no-shows (§9.1 —
      // checked_in patients are already present). The status flip itself is
      // the idempotency marker: once no_show, the filter no longer matches.
      const stale = await Appointment.find({
        status: { $in: ['scheduled', 'confirmed'] },
        start: { $lt: cutoff },
      })
        .sort({ start: 1 })
        .limit(BATCH_SIZE)
        .populate('patient', 'firstName phone')
        .populate('branch', 'name');

      if (stale.length === 0) break;

      for (const appointment of stale) {
        appointment.status = 'no_show';
        await appointment.save();

        emitToBranch(
          appointment.branch?._id ?? appointment.branch,
          'appointment:statusChanged',
          appointment,
        );
        await sendNoShowWhatsApp(appointment);
      }

      if (stale.length < BATCH_SIZE) break;
    }
  } catch (err) {
    console.error('[NoShow] Cron error:', err.message);
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
