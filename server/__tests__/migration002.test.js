/**
 * Tests for migration 002-add-indexes-ttl
 * 
 * Verifies that indexes are created correctly with proper TTL settings.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// Indexes created by migration 002. Checks are name-based: predicates like
// `idx.key.channel === 1 && idx.key.createdAt === -1` wrongly match model-owned
// compound indexes (e.g. branch_1_channel_1_createdAt_-1), producing false
// positives for existence and false negatives for rollback.
const MIGRATION_INDEX_NAMES = {
  messages: 'channel_1_createdAt_-1',
  invoices: 'branch_1_dueDate_1_status_1',
  auditlogs: 'createdAt_1_ttl_90d',
  errorlogs: 'createdAt_1_ttl_30d',
};

async function indexExists(collectionName, name) {
  const indexes = await mongoose.connection.db.collection(collectionName).indexes();
  return !!indexes.find((idx) => idx.name === name);
}

describe('Migration 002-add-indexes-ttl', () => {
  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    await mongoose.connect(testDbUri);

    // Run the migration so the collections and their indexes actually exist.
    const migration = await import('../migrations/002-add-indexes-ttl.js');
    await migration.up();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  describe('Rollback', () => {
    it('should remove the migration indexes when down() is executed', async () => {
      const migration = await import('../migrations/002-add-indexes-ttl.js');
      try {
        await migration.down();

        for (const [collection, name] of Object.entries(MIGRATION_INDEX_NAMES)) {
          expect(await indexExists(collection, name), `index ${name} on ${collection}`).toBe(false);
        }
      } finally {
        // Restore state so the following suites can assert on a migrated DB.
        await migration.up();
      }
    });
  });

  describe('Index creation', () => {
    it('should create messages channel+createdAt index', async () => {
      expect(await indexExists('messages', MIGRATION_INDEX_NAMES.messages)).toBe(true);
    });

    it('should create invoices branch+dueDate+status index', async () => {
      expect(await indexExists('invoices', MIGRATION_INDEX_NAMES.invoices)).toBe(true);
    });

    it('should create auditlogs TTL index with 90 days', async () => {
      const indexes = await mongoose.connection.db.collection('auditlogs').indexes();
      const ttlIndex = indexes.find((idx) => idx.name === MIGRATION_INDEX_NAMES.auditlogs);
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex.expireAfterSeconds).toBe(7776000); // 90 days in seconds
    });

    it('should create errorlogs TTL index with 30 days', async () => {
      const indexes = await mongoose.connection.db.collection('errorlogs').indexes();
      const ttlIndex = indexes.find((idx) => idx.name === MIGRATION_INDEX_NAMES.errorlogs);
      expect(ttlIndex).toBeDefined();
      expect(ttlIndex.expireAfterSeconds).toBe(2592000); // 30 days in seconds
    });
  });

  describe('TTL calculations', () => {
    it('should calculate correct TTL for 90 days', () => {
      const ninetyDaysInSeconds = 90 * 24 * 60 * 60;
      expect(ninetyDaysInSeconds).toBe(7776000);
    });

    it('should calculate correct TTL for 30 days', () => {
      const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
      expect(thirtyDaysInSeconds).toBe(2592000);
    });
  });

  describe('Migration up function', () => {
    it('should export up function', async () => {
      const migration = await import('../migrations/002-add-indexes-ttl.js');
      expect(typeof migration.up).toBe('function');
    });

    it('should export down function for rollback', async () => {
      const migration = await import('../migrations/002-add-indexes-ttl.js');
      expect(typeof migration.down).toBe('function');
    });
  });

  describe('Index query patterns', () => {
    function findIxscanIndexName(plan) {
      if (!plan) return '';
      if (plan.stage === 'IXSCAN' && plan.indexName) return plan.indexName;
      if (plan.inputStage) return findIxscanIndexName(plan.inputStage);
      if (Array.isArray(plan.inputStages)) {
        for (const s of plan.inputStages) {
          const name = findIxscanIndexName(s);
          if (name) return name;
        }
      }
      return '';
    }

    it('should use an index for channel pagination query', async () => {
      const db = mongoose.connection.db;
      const messagesCollection = db.collection('messages');
      await messagesCollection.insertOne({ channel: 'general', createdAt: new Date(), text: 'test' });

      try {
        const explain = await messagesCollection.find({ channel: 'general' })
          .sort({ createdAt: -1 })
          .limit(1)
          .explain('executionStats');

        // The exact { channel: 1, createdAt: -1 } index existence is asserted
        // in "Index creation". Here we prove the query is index-assisted
        // (an IXSCAN plan, not a collection scan).
        expect(findIxscanIndexName(explain.queryPlanner?.winningPlan)).not.toBe('');
      } finally {
        await messagesCollection.deleteMany({ channel: 'general', text: 'test' });
      }
    });

    it('should use an index for aging report query', async () => {
      const db = mongoose.connection.db;
      const invoicesCollection = db.collection('invoices');
      const uniqueBranch = new mongoose.Types.ObjectId();
      await invoicesCollection.insertOne({
        branch: uniqueBranch,
        status: 'unpaid',
        dueDate: new Date(),
        tenant: new mongoose.Types.ObjectId(),
      });

      try {
        const explain = await invoicesCollection.find({
          branch: uniqueBranch,
          status: { $in: ['unpaid', 'partial'] },
          dueDate: { $lt: new Date() },
        }).explain('executionStats');

        // The migration's exact { branch, dueDate, status } index existence is
        // asserted in "Index creation"; the planner may legitimately prefer the
        // model's { branch, status } index, so here we only assert the query is
        // index-assisted (IXSCAN, not a collection scan).
        expect(findIxscanIndexName(explain.queryPlanner?.winningPlan)).not.toBe('');
      } finally {
        await invoicesCollection.deleteMany({ branch: uniqueBranch });
      }
    });
  });
});
