import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const LOCK_COLLECTION = 'cron_locks';

/**
 * Distributed, single-instance guard for periodic jobs shared across
 * processes/containers. Exactly one worker owns a tick; the others back off.
 *
 * Insert-based token lock: one worker inserts the lock document; a second
 * worker hits the duplicate key and stops. A stale lock (expired, e.g. a
 * crashed tick) is stolen atomically — only the worker that deletes the exact
 * token then re-inserts it, so two thieves cannot both win.
 *
 * TTLs must stay comfortably below the job's interval so a normal next tick
 * is never blocked by a previous (possibly long-running) pass.
 */
export async function tryAcquireCronLock({ key, ttlMs }) {
  const db = mongoose.connection.db;
  const col = db.collection(LOCK_COLLECTION);
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const insert = async () => {
    try {
      await col.insertOne({ _id: key, token, acquiredAt: now, expiresAt });
      return true;
    } catch (err) {
      if (err?.code !== 11000 && err?.codeName !== 'DuplicateKey') throw err;
      return false;
    }
  };

  if (await insert()) return token;

  const existing = await col.findOne({ _id: key });
  if (!existing) return (await insert()) ? token : null;

  if (existing.expiresAt && existing.expiresAt > now) return null; // live lock

  const removed = await col.deleteOne({ _id: key, token: existing.token });
  if (removed.deletedCount !== 1) return null;
  return (await insert()) ? token : null;
}

export async function releaseCronLock(key, token) {
  if (!token) return;
  const db = mongoose.connection.db;
  await db.collection(LOCK_COLLECTION).deleteMany({ _id: key, token });
}

/**
 * Run `fn` only when this worker owns the lock. Returns `{ skipped: true }`
 * when another instance is already running the job.
 */
export async function withCronLock(key, ttlMs, fn) {
  const token = await tryAcquireCronLock({ key, ttlMs });
  if (!token) return { skipped: true };
  try {
    return await fn();
  } finally {
    await releaseCronLock(key, token);
  }
}