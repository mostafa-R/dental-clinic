import mongoose from 'mongoose';

import { universalToFdi } from '../constants/dental.js';

/**
 * Migration: 005-fdi-tooth-codes
 *
 * S1 (FDI unification, PRD §9.1): backfills the canonical FDI code
 * (ISO 3950) on every tooth reference from the legacy Universal `number`:
 *   - dentalcharts.teeth[].fdi  (from teeth[].number)
 *   - dentalcharts.history[].fdi (from history[].number)
 *   - treatmentplans.items[].fdi (from items[].tooth)
 *
 * Additive-only and idempotent: only entries with a missing/null `fdi` and
 * a valid legacy code are touched, so re-running is a no-op. `down()`
 * removes the backfilled fields, restoring the exact pre-S1 shape (the
 * legacy codes are never altered, which is what makes rollback safe).
 */

function fdiFor(legacy) {
  const n = Number(legacy);
  if (!Number.isInteger(n)) return null;
  return universalToFdi(n);
}

export async function up() {
  const db = mongoose.connection.db;
  let chartsPatched = 0;
  let plansPatched = 0;

  const chartCollections = await db.listCollections({ name: 'dentalcharts' }).toArray();
  if (chartCollections.length > 0) {
    const charts = db.collection('dentalcharts');
    const cursor = charts.find(
      {
        $or: [
          { 'teeth.fdi': null },
          { 'teeth.fdi': { $exists: false } },
          { 'history.fdi': null },
          { 'history.fdi': { $exists: false } },
        ],
      },
      { projection: { teeth: 1, history: 1 } },
    );
    for await (const doc of cursor) {
      let changed = false;
      for (const tooth of doc.teeth || []) {
        if ((tooth.fdi === null || tooth.fdi === undefined) && tooth.number !== undefined) {
          const fdi = fdiFor(tooth.number);
          if (fdi !== null) {
            tooth.fdi = fdi;
            changed = true;
          }
        }
      }
      for (const entry of doc.history || []) {
        if ((entry.fdi === null || entry.fdi === undefined) && entry.number !== undefined) {
          const fdi = fdiFor(entry.number);
          if (fdi !== null) {
            entry.fdi = fdi;
            changed = true;
          }
        }
      }
      if (changed) {
        await charts.updateOne(
          { _id: doc._id },
          { $set: { teeth: doc.teeth || [], history: doc.history || [] } },
        );
        chartsPatched += 1;
      }
    }
  }

  const planCollections = await db.listCollections({ name: 'treatmentplans' }).toArray();
  if (planCollections.length > 0) {
    const plans = db.collection('treatmentplans');
    const cursor = plans.find(
      {
        $or: [{ 'items.fdi': null }, { 'items.fdi': { $exists: false } }],
      },
      { projection: { items: 1 } },
    );
    for await (const doc of cursor) {
      let changed = false;
      for (const item of doc.items || []) {
        if ((item.fdi === null || item.fdi === undefined) && item.tooth !== undefined && item.tooth !== null) {
          const fdi = fdiFor(item.tooth);
          if (fdi !== null) {
            item.fdi = fdi;
            changed = true;
          }
        }
      }
      if (changed) {
        await plans.updateOne({ _id: doc._id }, { $set: { items: doc.items || [] } });
        plansPatched += 1;
      }
    }
  }

  console.log(`[Migration] 005 backfilled FDI codes on ${chartsPatched} chart(s), ${plansPatched} plan(s)`);
  return { chartsPatched, plansPatched };
}

export async function down() {
  const db = mongoose.connection.db;

  const chartCollections = await db.listCollections({ name: 'dentalcharts' }).toArray();
  if (chartCollections.length > 0) {
    await db.collection('dentalcharts').updateMany(
      {},
      { $unset: { 'teeth.$[].fdi': '', 'history.$[].fdi': '' } },
    );
    console.log('[Migration] 005 rollback: removed teeth[].fdi and history[].fdi');
  }

  const planCollections = await db.listCollections({ name: 'treatmentplans' }).toArray();
  if (planCollections.length > 0) {
    await db.collection('treatmentplans').updateMany({}, { $unset: { 'items.$[].fdi': '' } });
    console.log('[Migration] 005 rollback: removed items[].fdi');
  }
}
