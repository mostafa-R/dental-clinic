import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

import Recall from '../modules/recalls/recall.model.js';
import { publishEvent } from './eventBus.js';

// Hourly pass; each due recall is reminded at most once per
// RECALL_REMINDER_COOLDOWN_MS (atomic claim), so repeats are idempotent and
// the automation template cooldown (1440m) is never fighting a cron storm.
const CHECK_INTERVAL = '0 * * * *';
const BATCH_SIZE = 100;
const RECALL_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const RECALL_LOCK_COLLECTION = 'cron_locks';
const RECALL_LOCK_KEY = 'recall_cron';
const RECALL_LOCK_TTL_MS = 55 * 60 * 1000;

export async function tryAcquireRecallLock() {
  const db = mongoose.connection.db;
  const col = db.collection(RECALL_LOCK_COLLECTION);
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RECALL_LOCK_TTL_MS);

  const insert = async () => {
    try {
      await col.insertOne({ _id: RECALL_LOCK_KEY, token, acquiredAt: now, expiresAt });
      return true;
    } catch (err) {
      if (err?.code !== 11000 && err?.codeName !== 'DuplicateKey') throw err;
      return false;
    }
  };

  if (await insert()) return token;

  const existing = await col.findOne({ _id: RECALL_LOCK_KEY });
  if (!existing) return (await insert()) ? token : null;
  if (existing.expiresAt && existing.expiresAt > now) return null;

  const removed = await col.deleteOne({ _id: RECALL_LOCK_KEY, token: existing.token });
  if (removed.deletedCount !== 1) return null;
  return (await insert()) ? token : null;
}

export async function releaseRecallLock(token) {
  if (!token) return;
  const db = mongoose.connection.db;
  await db.collection(RECALL_LOCK_COLLECTION).deleteMany({ _id: RECALL_LOCK_KEY, token });
}

/**
 * Publish one `recall.due` event per actionable due recall.
 * The event carries the minimum contact metadata the reminder template
 * needs (patient firstName/phone — consistent with the no-show flow; the
 * persisted EventLog copy is PHI-stripped by the bus). Reminders are
 * template-driven: the cron never sends WhatsApp directly, so an enabled
 * template + engine cooldown is the single send path (no duplicates).
 */
export async function processDueRecalls({ now = Date.now(), lock = true } = {}) {
  const token = lock ? await tryAcquireRecallLock() : null;
  if (lock && !token) return { skipped: true };

  try {
    const at = now instanceof Date ? now : new Date(now);
    const reminderCutoff = new Date(at.getTime() - RECALL_REMINDER_COOLDOWN_MS);
    let processed = 0;

    for (;;) {
      const due = await Recall.find({
        status: { $in: ['due', 'contacted'] },
        dueDate: { $lte: at },
        tenant: { $exists: true, $ne: null },
        $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: reminderCutoff } }],
      })
        .sort({ dueDate: 1 })
        .limit(BATCH_SIZE)
        .populate('patient', 'firstName lastName phone patientId');

      if (due.length === 0) break;

      for (const recall of due) {
        // Atomic claim: only the worker that stamps lastReminderAt sends.
        // A concurrent tick (or a repeat run) sees the fresh stamp and skips.
        const claimed = await Recall.updateOne(
          {
            _id: recall._id,
            status: { $in: ['due', 'contacted'] },
            $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: reminderCutoff } }],
          },
          { $set: { lastReminderAt: at } },
        );
        if (claimed.modifiedCount !== 1) continue;
        processed += 1;

        const tenantId = recall.tenant;
        const branchId = recall.branch;
        const patient = recall.patient && typeof recall.patient === 'object' ? recall.patient : null;
        // Awaited (not fire-and-forget): the claim already stamped
        // lastReminderAt, so a crash between claim and publish would lose the
        // reminder. publishEvent never throws, so awaiting only costs ~ms.
        await publishEvent({
          eventType: 'recall.due',
          tenantId,
          branchId,
          aggregateType: 'recall',
          aggregateId: recall._id,
          metadata: {
            recallId: String(recall._id),
            dueDate: recall.dueDate?.toISOString?.() || recall.dueDate,
            recallType: recall.recallType,
            reason: recall.reason || '',
            patient: patient
              ? { firstName: patient.firstName, phone: patient.phone }
              : null,
          },
        });
      }

      if (due.length < BATCH_SIZE) break;
    }

    return { processed };
  } catch (err) {
    console.error('[RecallCron] error:', err.message);
    return { error: err.message };
  } finally {
    if (lock) await releaseRecallLock(token);
  }
}

let task = null;

export function startRecallCron() {
  task = cron.schedule(CHECK_INTERVAL, () => processDueRecalls());
  console.log('[RecallCron] Scheduled hourly');
}

export function stopRecallCron() {
  if (task) {
    task.stop();
    task = null;
    console.log('[RecallCron] Stopped');
  }
}
