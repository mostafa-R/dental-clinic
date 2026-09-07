import cron from 'node-cron';
import Consent from '../modules/emr/consent.model.js';
import { publishEvent } from './eventBus.js';
import { withTransaction } from '../core/transaction.js';

const BATCH_SIZE = 200;

/**
 * M6: consents that were offered (`sent`) but never answered roll to `expired`
 * once their `expiresAt` passes — automatically and in the background. Expired
 * consents can no longer be signed (the controller also guards the window
 * between expiry and the next cron tick).
 */
async function expirePendingConsents() {
  const now = new Date();
  let processed = 0;

  for (;;) {
    const pending = await Consent.find({
      status: 'sent',
      expiresAt: { $ne: null, $lte: now },
      isActive: true,
    })
      .select('_id tenant branch')
      .skip(processed)
      .limit(BATCH_SIZE)
      .lean();

    if (pending.length === 0) break;

    const ids = pending.map((c) => c._id);
    const updated = await withTransaction(async (session) => {
      const res = await Consent.updateMany(
        { _id: { $in: ids }, status: 'sent', isActive: true },
        { $set: { status: 'expired' } },
        { session },
      );
      return res.modifiedCount || 0;
    });

    processed += updated;

    for (const c of pending) {
      void publishEvent({
        type: 'consent.expired',
        tenant: c.tenant,
        branch: c.branch,
        data: { consentId: String(c._id) },
      });
    }
  }

  if (processed > 0) {
    console.log(`[ConsentExpiryCron] Expired ${processed} consent(s)`);
  }
}

let task = null;

export function startConsentExpiryCron() {
  task = cron.schedule('*/15 * * * *', expirePendingConsents);
  console.log('[ConsentExpiryCron] Scheduled every 15 minutes');
}

export function stopConsentExpiryCron() {
  if (task) {
    task.stop();
    task = null;
    console.log('[ConsentExpiryCron] Stopped');
  }
}