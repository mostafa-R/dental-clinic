import mongoose from 'mongoose';

/**
 * Migration: 002-add-indexes-ttl
 * 
 * Adds:
 * 1. Compound index for messages: { channel, createdAt } - for channel pagination
 * 2. Compound index for invoices: { branch, dueDate, status } - for aging reports
 * 3. TTL index for auditlogs: expireAfterSeconds: 7776000 (90 days)
 * 4. TTL index for errorlogs: expireAfterSeconds: 2592000 (30 days)
 * 
 * These indexes fix:
 * - Slow pagination on messages by channel
 * - Slow aging report queries on invoices
 * - Unbounded log growth in auditlogs and errorlogs
 */

export async function up() {
  const db = mongoose.connection.db;

  // 1. Messages: Add compound index for channel pagination
  // Note: There's already { branch: 1, channel: 1, createdAt: -1 }
  // We add { channel: 1, createdAt: -1 } for channel-first queries
  try {
    const messagesCollection = db.collection('messages');
    const messageIndexes = await messagesCollection.indexes();
    
    // Check if the index already exists
    const channelCreatedAtIndex = messageIndexes.find(
      (idx) => idx.key.channel === 1 && idx.key.createdAt === -1
    );
    
    if (!channelCreatedAtIndex) {
      await messagesCollection.createIndex(
        { channel: 1, createdAt: -1 },
        { 
          name: 'channel_1_createdAt_-1',
          background: true,
          partialFilterExpression: { channel: { $ne: null } }
        }
      );
      console.log('[Migration] Created messages index: { channel: 1, createdAt: -1 }');
    } else {
      console.log('[Migration] Messages index { channel: 1, createdAt: -1 } already exists');
    }
  } catch (err) {
    console.error('[Migration] Failed to create messages index:', err.message);
    throw err;
  }

  // 2. Invoices: Add compound index for aging reports
  // There's already { dueDate: 1, status: 1 }, we add branch for branch-scoped aging
  try {
    const invoicesCollection = db.collection('invoices');
    const invoiceIndexes = await invoicesCollection.indexes();
    
    const branchDueDateStatusIndex = invoiceIndexes.find(
      (idx) => idx.key.branch === 1 && idx.key.dueDate === 1 && idx.key.status === 1
    );
    
    if (!branchDueDateStatusIndex) {
      await invoicesCollection.createIndex(
        { branch: 1, dueDate: 1, status: 1 },
        { 
          name: 'branch_1_dueDate_1_status_1',
          background: true,
          partialFilterExpression: { 
            status: { $in: ['unpaid', 'partial'] },
            dueDate: { $exists: true, $ne: null }
          }
        }
      );
      console.log('[Migration] Created invoices index: { branch: 1, dueDate: 1, status: 1 }');
    } else {
      console.log('[Migration] Invoices index { branch: 1, dueDate: 1, status: 1 } already exists');
    }
  } catch (err) {
    console.error('[Migration] Failed to create invoices index:', err.message);
    throw err;
  }

  // 3. AuditLogs: Add TTL index (90 days = 7,776,000 seconds)
  try {
    const auditLogsCollection = db.collection('auditlogs');
    const auditIndexes = await auditLogsCollection.indexes();
    
    const existingTtlIndex = auditIndexes.find(
      (idx) => idx.key.createdAt === 1 && idx.expireAfterSeconds
    );
    
    if (existingTtlIndex) {
      // Update existing TTL if different
      if (existingTtlIndex.expireAfterSeconds !== 7776000) {
        await auditLogsCollection.dropIndex(existingTtlIndex.name);
        await auditLogsCollection.createIndex(
          { createdAt: 1 },
          { 
            name: 'createdAt_1_ttl_90d',
            expireAfterSeconds: 7776000, // 90 days
            background: true
          }
        );
        console.log('[Migration] Updated auditlogs TTL to 90 days');
      } else {
        console.log('[Migration] Auditlogs TTL index already set to 90 days');
      }
    } else {
      // Check if there's a non-TTL createdAt index
      const createdAtIndex = auditIndexes.find(
        (idx) => idx.key.createdAt === -1 && !idx.expireAfterSeconds
      );
      
      // Create new TTL index (different from the existing -1 index)
      await auditLogsCollection.createIndex(
        { createdAt: 1 },
        { 
          name: 'createdAt_1_ttl_90d',
          expireAfterSeconds: 7776000, // 90 days
          background: true
        }
      );
      console.log('[Migration] Created auditlogs TTL index: 90 days');
    }
  } catch (err) {
    console.error('[Migration] Failed to create auditlogs TTL index:', err.message);
    throw err;
  }

  // 4. ErrorLogs: Add TTL index (30 days = 2,592,000 seconds)
  try {
    const errorLogsCollection = db.collection('errorlogs');
    const errorIndexes = await errorLogsCollection.indexes();
    
    const existingTtlIndex = errorIndexes.find(
      (idx) => idx.key.createdAt === 1 && idx.expireAfterSeconds
    );
    
    if (existingTtlIndex) {
      // Update existing TTL if different
      if (existingTtlIndex.expireAfterSeconds !== 2592000) {
        await errorLogsCollection.dropIndex(existingTtlIndex.name);
        await errorLogsCollection.createIndex(
          { createdAt: 1 },
          { 
            name: 'createdAt_1_ttl_30d',
            expireAfterSeconds: 2592000, // 30 days
            background: true
          }
        );
        console.log('[Migration] Updated errorlogs TTL to 30 days');
      } else {
        console.log('[Migration] Errorlogs TTL index already set to 30 days');
      }
    } else {
      // Create new TTL index
      await errorLogsCollection.createIndex(
        { createdAt: 1 },
        { 
          name: 'createdAt_1_ttl_30d',
          expireAfterSeconds: 2592000, // 30 days
          background: true
        }
      );
      console.log('[Migration] Created errorlogs TTL index: 30 days');
    }
  } catch (err) {
    console.error('[Migration] Failed to create errorlogs TTL index:', err.message);
    throw err;
  }

  console.log('[Migration] 002-add-indexes-ttl completed successfully');
}

export async function down() {
  const db = mongoose.connection.db;

  // Remove the indexes created by this migration
  try {
    // Messages
    const messagesCollection = db.collection('messages');
    const messageIndexes = await messagesCollection.indexes();
    const channelCreatedAtIndex = messageIndexes.find(
      (idx) => idx.name === 'channel_1_createdAt_-1'
    );
    if (channelCreatedAtIndex) {
      await messagesCollection.dropIndex('channel_1_createdAt_-1');
      console.log('[Migration] Dropped messages index: channel_1_createdAt_-1');
    }

    // Invoices
    const invoicesCollection = db.collection('invoices');
    const invoiceIndexes = await invoicesCollection.indexes();
    const branchDueDateStatusIndex = invoiceIndexes.find(
      (idx) => idx.name === 'branch_1_dueDate_1_status_1'
    );
    if (branchDueDateStatusIndex) {
      await invoicesCollection.dropIndex('branch_1_dueDate_1_status_1');
      console.log('[Migration] Dropped invoices index: branch_1_dueDate_1_status_1');
    }

    // AuditLogs TTL
    const auditLogsCollection = db.collection('auditlogs');
    const auditIndexes = await auditLogsCollection.indexes();
    const auditTtlIndex = auditIndexes.find(
      (idx) => idx.name === 'createdAt_1_ttl_90d'
    );
    if (auditTtlIndex) {
      await auditLogsCollection.dropIndex('createdAt_1_ttl_90d');
      console.log('[Migration] Dropped auditlogs TTL index');
    }

    // ErrorLogs TTL
    const errorLogsCollection = db.collection('errorlogs');
    const errorIndexes = await errorLogsCollection.indexes();
    const errorTtlIndex = errorIndexes.find(
      (idx) => idx.name === 'createdAt_1_ttl_30d'
    );
    if (errorTtlIndex) {
      await errorLogsCollection.dropIndex('createdAt_1_ttl_30d');
      console.log('[Migration] Dropped errorlogs TTL index');
    }

    console.log('[Migration] 002-add-indexes-ttl rollback completed');
  } catch (err) {
    console.error('[Migration] Rollback failed:', err.message);
    throw err;
  }
}
