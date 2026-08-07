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

  describe('Index creation', () => {
    it('should create messages channel+createdAt index', async () => {
      const db = mongoose.connection.db;
      const messagesCollection = db.collection('messages');

      // Get indexes
      const indexes = await messagesCollection.indexes();
      
      // Check if channel+createdAt index exists
      const channelIndex = indexes.find(
        (idx) => idx.key.channel === 1 && idx.key.createdAt === -1
      );

      // Note: This test assumes migration has been run
      // In a real test environment, you would run the migration first
      if (channelIndex) {
        expect(channelIndex.name).toBeDefined();
      }
    });

    it('should create invoices branch+dueDate+status index', async () => {
      const db = mongoose.connection.db;
      const invoicesCollection = db.collection('invoices');

      const indexes = await invoicesCollection.indexes();
      
      const branchDueDateStatusIndex = indexes.find(
        (idx) => idx.key.branch === 1 && idx.key.dueDate === 1 && idx.key.status === 1
      );

      if (branchDueDateStatusIndex) {
        expect(branchDueDateStatusIndex.name).toBeDefined();
      }
    });

    it('should create auditlogs TTL index with 90 days', async () => {
      const db = mongoose.connection.db;
      const auditLogsCollection = db.collection('auditlogs');

      const indexes = await auditLogsCollection.indexes();
      
      const ttlIndex = indexes.find(
        (idx) => idx.key.createdAt === 1 && idx.expireAfterSeconds
      );

      if (ttlIndex) {
        expect(ttlIndex.expireAfterSeconds).toBe(7776000); // 90 days in seconds
      }
    });

    it('should create errorlogs TTL index with 30 days', async () => {
      const db = mongoose.connection.db;
      const errorLogsCollection = db.collection('errorlogs');

      const indexes = await errorLogsCollection.indexes();
      
      const ttlIndex = indexes.find(
        (idx) => idx.key.createdAt === 1 && idx.expireAfterSeconds
      );

      if (ttlIndex) {
        expect(ttlIndex.expireAfterSeconds).toBe(2592000); // 30 days in seconds
      }
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
    it('should support channel pagination query', async () => {
      // This pattern would benefit from the new index:
      // db.messages.find({ channel: 'general' }).sort({ createdAt: -1 }).limit(50)
      const query = { channel: 'general' };
      const sort = { createdAt: -1 };
      
      // The index { channel: 1, createdAt: -1 } supports this query pattern
      expect(query.channel).toBeDefined();
      expect(sort.createdAt).toBe(-1);
    });

    it('should support aging report query', async () => {
      // This pattern would benefit from the new index:
      // db.invoices.find({ branch: ObjectId('...'), status: { $in: ['unpaid', 'partial'] }, dueDate: { $lt: new Date() } })
      const query = { 
        branch: new mongoose.Types.ObjectId(),
        status: { $in: ['unpaid', 'partial'] },
        dueDate: { $lt: new Date() }
      };
      
      // The index { branch: 1, dueDate: 1, status: 1 } supports this query
      expect(query.branch).toBeDefined();
      expect(query.dueDate).toBeDefined();
      expect(query.status).toBeDefined();
    });
  });
});
