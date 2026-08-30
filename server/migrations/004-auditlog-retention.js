import mongoose from 'mongoose';

/**
 * Migration: 004-auditlog-retention
 *
 * Removes the 90-day TTL index from the auditlogs collection. Audit trails are
 * a compliance artifact (tenant.suspend / impersonation / admin actions) and
 * being able to reconstruct "who did what, when" after 90 days outweighs the
 * storage cost. Error logs keep their 30-day TTL.
 *
 * The migration is idempotent: if no TTL index exists on auditlogs it does
 * nothing.
 */

export async function up() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'auditlogs' }).toArray();
  if (collections.length === 0) return;

  const auditLogs = db.collection('auditlogs');
  const indexes = await auditLogs.indexes();
  const ttlIndexes = indexes.filter(
    (idx) => idx.key.createdAt === 1 && idx.expireAfterSeconds,
  );

  if (ttlIndexes.length === 0) {
    console.log('[Migration] No auditlogs TTL index to remove');
    return;
  }

  for (const idx of ttlIndexes) {
    await auditLogs.dropIndex(idx.name);
    console.log(`[Migration] Dropped auditlogs TTL index: ${idx.name}`);
  }
  console.log('[Migration] Audit logs are now retained indefinitely');
}

export async function down() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'auditlogs' }).toArray();
  if (collections.length === 0) return;

  const auditLogs = db.collection('auditlogs');
  const indexes = await auditLogs.indexes();
  if (indexes.some((idx) => idx.name === 'createdAt_1_ttl_90d')) {
    console.log('[Migration] Auditlogs 90-day TTL index already exists');
    return;
  }

  await auditLogs.createIndex(
    { createdAt: 1 },
    {
      name: 'createdAt_1_ttl_90d',
      expireAfterSeconds: 7776000, // 90 days
      background: true,
    },
  );
  console.log('[Migration] Restored auditlogs TTL index: 90 days');
}