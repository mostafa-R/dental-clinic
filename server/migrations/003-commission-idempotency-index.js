import mongoose from 'mongoose';

/**
 * Migration: 003-commission-idempotency-index
 *
 * Adds a unique compound index { invoice, doctor, procedureName } on the
 * commissions collection. Concurrent full-payment requests could previously
 * both pass the "find existing commission" step and insert duplicate records —
 * the duplicate-key catch in accrueCommissionForInvoice was dead code because
 * nothing enforced uniqueness. The index makes that catch effective.
 *
 * Existing duplicates (from the pre-index era) are deduplicated first —
 * keeping the earliest record per (invoice, doctor, procedureName) — so the
 * unique index can be created on a dirty database.
 */

export async function up() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'commissions' }).toArray();
  if (collections.length === 0) return;

  const commissions = db.collection('commissions');

  // Deduplicate: keep the earliest _id per (invoice, doctor, procedureName).
  const duplicateGroups = await commissions
    .aggregate([
      { $match: { invoice: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { invoice: '$invoice', doctor: '$doctor', procedureName: '$procedureName' },
          ids: { $push: '$_id' },
        },
      },
      { $match: { $expr: { $gt: [{ $size: '$ids' }, 1] } } },
    ])
    .toArray();

  let removed = 0;
  for (const group of duplicateGroups) {
    const ids = group.ids;
    const [keep, ...duplicates] = ids;
    const result = await commissions.deleteMany({ _id: { $in: duplicates } });
    removed += result.deletedCount || 0;
    console.log(
      `[Migration] Deduplicated ${duplicates.length} commission record(s) for invoice ${group._id.invoice}, doctor ${group._id.doctor} (kept ${keep})`,
    );
  }
  console.log(`[Migration] Removed ${removed} duplicate commission record(s)`);

  // Create the unique partial index (only documents that actually reference
  // an invoice participate, so null-invoice records never collide).
  const existing = await commissions
    .indexes()
    .then((is) => is.find((idx) => idx.name === 'unique_commission_per_invoice_doctor_procedure'));
  if (existing) {
    console.log('[Migration] Unique commission index already exists');
    return;
  }

  await commissions.createIndex(
    { invoice: 1, doctor: 1, procedureName: 1 },
    {
      unique: true,
      name: 'unique_commission_per_invoice_doctor_procedure',
      partialFilterExpression: { invoice: { $type: 'objectId' } },
      background: true,
    },
  );
  console.log('[Migration] Created unique commission index: { invoice, doctor, procedureName }');
}

export async function down() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'commissions' }).toArray();
  if (collections.length === 0) return;

  const commissions = db.collection('commissions');
  const indexes = await commissions.indexes();
  const index = indexes.find((idx) => idx.name === 'unique_commission_per_invoice_doctor_procedure');
  if (index) {
    await commissions.dropIndex(index.name);
    console.log('[Migration] Dropped unique commission index');
  }
}