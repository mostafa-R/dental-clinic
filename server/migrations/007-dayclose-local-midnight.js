import mongoose from 'mongoose';

import { loadTenantTimezone } from '../utils/timezoneUtils.js';
import { localDateString, zonedDayStartUtc } from '../utils/zonedDates.js';

/**
 * Migration: 007-dayclose-local-midnight
 *
 * Day Close stored `date` as the start-of-day produced by the *server's*
 * `setHours(0,0,0,0)` (see the old `startOfDay` helper in
 * `accounting.controller.js`). A Day Close is a local calendar day of the
 * clinic, so the timestamp that identifies the shift must be the clinic's own
 * local midnight, not the server's. The controller now resolves that through
 * `zonedDayRangeUtc` / `zonedDayStartUtc`.
 *
 * Why this needs a data pass and not just a code change:
 *   - `{ branch, date }` carries a unique index that is the guard against
 *     double-closing a day. If existing rows keep the old server-midnight value
 *     while new closes use clinic midnight, the two spellings of "the same day"
 *     both pass the "already closed?" check and the second insert then fails on
 *     the index — or worse, slips through on a server whose zone happened to
 *     match, depending on where it is deployed.
 *   - Rows written by a server in one timezone would sort and range-filter
 *     against rows written by another in a different one.
 *
 * Each row is re-keyed from its own tenant's timezone, so a multi-timezone
 * install is handled correctly (a clinic that changed timezone gets its existing
 * rows re-anchored too, which is the intent — `date` always means "that day in
 * the clinic's current timezone").
 *
 * The two-pass write is deliberate. `date` is indexed, and `updateMany` on a
 * new value can transiently collide with a row that has not been moved yet;
 * staging every row into a temp field first and only then committing means the
 * unique index is never violated mid-run. `down()` reverses the shift back to
 * server-local midnight, which is what the old code would have written.
 */

const COLLECTION = 'daycloses';
const TMP_FIELD = 'date_legacy_pre007';

async function collections(db) {
  const found = await db.listCollections({ name: COLLECTION }).toArray();
  return found.length ? db.collection(COLLECTION) : null;
}

export async function up() {
  const db = mongoose.connection.db;
  const dayCloses = await collections(db);
  if (!dayCloses) {
    console.log('[Migration] No daycloses collection — nothing to migrate');
    return { updated: 0 };
  }

  // One timezone lookup per distinct tenant, not per row.
  const tenantIds = await dayCloses.distinct('tenant');
  const tzByTenant = new Map();
  for (const id of tenantIds) {
    if (!id) continue;
    tzByTenant.set(String(id), await loadTenantTimezone(id));
  }

  // Pass 1 — stage a copy of the original value next to it. Read and written
  // per row in JS rather than via an aggregation pipeline: this touches no
  // indexed field, so the unique index is irrelevant during the copy and the
  // migration works on any MongoDB 4.0+ (the floor already required by
  // `withTransaction`).
  const stageCursor = dayCloses.find({ [TMP_FIELD]: { $exists: false } });
  for await (const doc of stageCursor) {
    await dayCloses.updateOne(
      { _id: doc._id },
      { $set: { [TMP_FIELD]: doc.date } },
    );
  }

  // Pass 2 — re-anchor onto the tenant's local midnight.
  const cursor = dayCloses.find({ [TMP_FIELD]: { $exists: true } });
  let updated = 0;
  for await (const doc of cursor) {
    const tz = tzByTenant.get(String(doc.tenant)) || 'UTC';
    // Read the day off the stored instant *in the clinic's zone*; that is the
    // day the row was meant to describe.
    const day = localDateString(new Date(doc[TMP_FIELD]).getTime(), tz);
    const start = zonedDayStartUtc(day, tz);
    if (start == null) continue;
    await dayCloses.updateOne(
      { _id: doc._id },
      { $set: { date: new Date(start) }, $unset: { [TMP_FIELD]: '' } },
    );
    updated += 1;
  }

  console.log(`[Migration] 007 re-anchored ${updated} day close(s) onto clinic-local midnight`);
  return { updated };
}

export async function down() {
  const db = mongoose.connection.db;
  const dayCloses = await collections(db);
  if (!dayCloses) return;

  // Restore the old server-local-midnight spelling.
  const cursor = dayCloses.find({});
  let restored = 0;
  for await (const doc of cursor) {
    const d = new Date(doc.date);
    d.setHours(0, 0, 0, 0);
    await dayCloses.updateOne({ _id: doc._id }, { $set: { date: d } });
    restored += 1;
  }

  console.log(`[Migration] 007 rollback: restored ${restored} day close(s) to server-local midnight`);
}
