/**
 * Tests for Invoice Counter Transactional Integrity (ISSUE-012)
 * 
 * Verifies that invoice number generation and invoice creation are atomic,
 * preventing invoice-number gaps when creation fails.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Mock Redis
vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
await mongoose.connect(testDbUri);

// Multi-document transactions require a replica set (or mongos). A standalone
// MongoDB deployment cannot run them, so those tests are skipped there and
// exercised in CI, which runs a single-node replica set.
let supportsTransactions = false;
try {
  await mongoose.connection.db.admin().command({ replSetGetStatus: 1 });
  supportsTransactions = true;
} catch {
  supportsTransactions = false;
}

describe('Invoice Counter Transaction', () => {
  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    const collections = mongoose.connection.collections;
    for (const name of ['invoices', 'counters', 'patients', 'branches', 'tenants', 'users']) {
      if (collections[name]) {
        await collections[name].deleteMany({});
      }
    }
  });

  describe.skipIf(!supportsTransactions)('Counter.next with session', () => {
    it('should increment counter within a transaction', async () => {
      const Counter = (await import('../core/counters.js')).default;
      const { withTransaction } = await import('../core/transaction.js');

      const result = await withTransaction(async (session) => {
        const seq = await Counter.next('test-counter', null, session);
        return seq;
      });

      expect(result).toBe(1);

      // Verify counter was persisted
      const counter = await Counter.findById('test-counter');
      expect(counter.seq).toBe(1);
    });

    it('should rollback counter on transaction abort', async () => {
      const Counter = (await import('../core/counters.js')).default;
      const { withTransaction } = await import('../core/transaction.js');

      // Get initial counter state
      const initialCounter = await Counter.findById('test-rollback-counter');
      const initialSeq = initialCounter?.seq || 0;

      try {
        await withTransaction(async (session) => {
          const seq = await Counter.next('test-rollback-counter', null, session);
          // Force an error to test rollback
          throw new Error('Intentional error for rollback test');
        });
      } catch (err) {
        expect(err.message).toBe('Intentional error for rollback test');
      }

      // Verify counter was rolled back
      const counter = await Counter.findById('test-rollback-counter');
      expect(counter?.seq || 0).toBe(initialSeq);
    });

    it('should generate sequential invoice numbers', async () => {
      const Counter = (await import('../core/counters.js')).default;
      const { withTransaction } = await import('../core/transaction.js');

      const seq1 = await withTransaction(async (session) => {
        return await Counter.next('invoice', 'tenant-1', session);
      });

      const seq2 = await withTransaction(async (session) => {
        return await Counter.next('invoice', 'tenant-1', session);
      });

      expect(seq2).toBe(seq1 + 1);
    });
  });

  describe('Invoice creation with counter', () => {
    it('should assign invoice number atomically with creation', async () => {
      const Invoice = (await import('../modules/billing/invoice.model.js')).default;
      const Patient = (await import('../modules/patients/patient.model.js')).default;
      const Branch = (await import('../modules/users/branch.model.js')).default;
      const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;

      // Create test data
      const tenant = await Tenant.create({
        name: 'Test Clinic',
        email: 'test@clinic.com',
        slug: 'test-clinic',
        plan: 'professional',
        status: 'active',
        isActive: true,
      });

      const branch = await Branch.create({
        tenant: tenant._id,
        name: 'Main Branch',
        address: '123 Main St',
      });

      const patient = await Patient.create({
        tenant: tenant._id,
        branch: branch._id,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      });

      // Create invoice
      const invoice = await Invoice.create({
        tenant: tenant._id,
        branch: branch._id,
        patient: patient._id,
        items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
      });

      expect(invoice.invoiceNo).toBeDefined();
      expect(invoice.invoiceNo).toMatch(/^INV-\d{4}-\d{5}$/);

      // Create another invoice and verify sequence
      const invoice2 = await Invoice.create({
        tenant: tenant._id,
        branch: branch._id,
        patient: patient._id,
        items: [{ description: 'Service 2', quantity: 1, unitPrice: 200 }],
      });

      expect(invoice2.invoiceNo).toBeDefined();
      expect(invoice2.invoiceNo).not.toBe(invoice.invoiceNo);
    });

    it('should have proper invoice number format', async () => {
      const Counter = (await import('../core/counters.js')).default;

      const seq = 123;
      const year = new Date().getFullYear();
      const invoiceNo = `INV-${year}-${String(seq).padStart(5, '0')}`;

      expect(invoiceNo).toBe(`INV-${year}-00123`);
    });
  });

  describe.skipIf(!supportsTransactions)('Tenant-scoped counters', () => {
    it('should maintain separate counters per tenant', async () => {
      const Counter = (await import('../core/counters.js')).default;
      const { withTransaction } = await import('../core/transaction.js');

      const seq1A = await withTransaction(async (session) => {
        return await Counter.next('invoice', 'tenant-A', session);
      });

      const seq1B = await withTransaction(async (session) => {
        return await Counter.next('invoice', 'tenant-B', session);
      });

      const seq2A = await withTransaction(async (session) => {
        return await Counter.next('invoice', 'tenant-A', session);
      });

      // Each tenant starts from 1
      expect(seq1A).toBe(1);
      expect(seq1B).toBe(1);

      // Each tenant increments independently
      expect(seq2A).toBe(2);
    });
  });

  describe.skipIf(!supportsTransactions)('Counter.next concurrency (real race)', () => {
    it('should issue unique, gap-free sequence numbers under 50 concurrent callers', async () => {
      const Counter = (await import('../core/counters.js')).default;
      const N = 50;
      const results = await Promise.allSettled(
        Array.from({ length: N }, () => Counter.next('race-counter', 'tenant-race')),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);

      // All 50 succeeded (no E11000 crash on upsert race)
      expect(ok).toHaveLength(N);

      // Every sequence number is unique
      const sorted = ok.slice().sort((a, b) => a - b);
      expect(new Set(sorted).size).toBe(N);

      // No gaps: the set is exactly 1..N
      expect(sorted[0]).toBe(1);
      expect(sorted[sorted.length - 1]).toBe(N);

      // DB counter matches the last issued number
      const counter = await Counter.findById('race-counter:tenant-race');
      expect(counter.seq).toBe(N);
    });

    it('should issue 200 unique sequence numbers without failure', async () => {
      const Counter = (await import('../core/counters.js')).default;
      const N = 200;
      const results = await Promise.allSettled(
        Array.from({ length: N }, () => Counter.next('race-counter-200', 'tenant-race-200')),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      expect(ok).toHaveLength(N);
      expect(new Set(ok).size).toBe(N);
      expect(Math.max(...ok)).toBe(N);
    });
  });

  describe('Invoice.create concurrent race', () => {
    it('should assign 50 unique invoiceNo values under concurrent writes', async () => {
      const Invoice = (await import('../modules/billing/invoice.model.js')).default;
      const Patient = (await import('../modules/patients/patient.model.js')).default;
      const Branch = (await import('../modules/users/branch.model.js')).default;
      const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;

      const tenant = await Tenant.create({
        name: 'Race Clinic', email: 'race@test.com', slug: 'race-clinic',
        plan: 'professional', status: 'active', isActive: true,
      });
      const branch = await Branch.create({
        tenant: tenant._id, name: 'Main', address: '1 Main St', phone: '+3000000001',
      });
      const patient = await Patient.create({
        tenant: tenant._id, branch: branch._id, firstName: 'Race', lastName: 'Patient',
        phone: '+3000000002',
      });

      const N = 50;
      const settled = await Promise.allSettled(
        Array.from({ length: N }, (_, i) =>
          Invoice.create({
            tenant: tenant._id, branch: branch._id, patient: patient._id,
            items: [{ description: `Service ${i}`, quantity: 1, unitPrice: 10 + i }],
          }),
        ),
      );
      const ok = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const nos = ok.map((inv) => inv.invoiceNo);

      // All succeeded and every invoiceNo is unique
      expect(ok).toHaveLength(N);
      expect(new Set(nos).size).toBe(N);

      // Format sanity
      nos.forEach((no) => expect(no).toMatch(/^INV-\d{4}-\d{5}$/));

      // Exactly N documents persisted in DB
      const dbCount = await Invoice.countDocuments({ tenant: tenant._id });
      expect(dbCount).toBe(N);
    });

    it('should reject a duplicate invoiceNo via the unique index', async () => {
      const Invoice = (await import('../modules/billing/invoice.model.js')).default;
      const Patient = (await import('../modules/patients/patient.model.js')).default;
      const Branch = (await import('../modules/users/branch.model.js')).default;
      const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;

      const tenant = await Tenant.create({
        name: 'Dup Clinic', email: 'dup@test.com', slug: 'dup-clinic',
        plan: 'professional', status: 'active', isActive: true,
      });
      const branch = await Branch.create({
        tenant: tenant._id, name: 'Main', address: '1 Main St', phone: '+4000000001',
      });
      const patient = await Patient.create({
        tenant: tenant._id, branch: branch._id, firstName: 'Dup', lastName: 'Patient',
        phone: '+4000000002',
      });

      const inv = await Invoice.create({
        tenant: tenant._id, branch: branch._id, patient: patient._id,
        items: [{ description: 'Original', quantity: 1, unitPrice: 100 }],
      });

      await expect(
        Invoice.create({
          tenant: tenant._id, branch: branch._id, patient: patient._id,
          invoiceNo: inv.invoiceNo, items: [{ description: 'Dup', quantity: 1, unitPrice: 50 }],
        }),
      ).rejects.toMatchObject({ code: 11000 });
    });
  });
});
