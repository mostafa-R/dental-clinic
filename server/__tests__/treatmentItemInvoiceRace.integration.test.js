/**
 * Integration test (real replica-set MongoDB) for the treatment-item
 * cancellation vs concurrent invoicing race (regression for M5 hardening):
 *
 *   A simultaneous cancel + invoice on the SAME item must never desync:
 *     - at most ONE invoice may ever exist for the item (no double-billing),
 *     - the item always ends referenced to exactly the real invoice,
 *     - a cancel that loses to a concurrent invoice gets a clean 409
 *       (`...already been invoiced`), never a raw 500.
 *
 * updateTreatmentItem re-reads the plan INSIDE its transaction so it observes
 * a committed concurrent invoice instead of a stale in-memory copy.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../config/redis.js', () => ({ getRedis: vi.fn(() => null) }));
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn(),
}));
vi.mock('../utils/cache.js', () => ({
  getCachedTenant: vi.fn(() => null), cacheTenant: vi.fn(),
  invalidateTenant: vi.fn(), getCachedRole: vi.fn(() => null), cacheRole: vi.fn(),
}));
vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn(() => {}), emitToTenant: vi.fn(() => {}),
}));

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

describe('treatment item cancel vs concurrent invoice (single-winner safeguard)', () => {
  const DB = 'mongodb://127.0.0.1:27017/dental_os_treatment_item_race_test';
  let Tenant, Branch, Patient, TreatmentPlan, Invoice, Counter, controller;
  let tenantId, branchId;
  let seq = 0;

  beforeAll(async () => {
    await mongoose.connect(DB);

    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Patient = (await import('../modules/patients/patient.model.js')).default;
    TreatmentPlan = (await import('../modules/emr/treatmentPlan.model.js')).default;
    Invoice = (await import('../modules/billing/invoice.model.js')).default;
    Counter = (await import('../core/counters.js')).default;
    controller = await import('../modules/emr/treatmentPlan.controller.js');
    // Pre-register models referenced inside transactions (MissingSchemaError
    // guard) — mirrors the concurrency demo.
    await import('../modules/users/user.model.js');
    await import('../modules/users/branch.model.js');
    await import('../modules/billing/commission.model.js');
    await import('../modules/patients/wallet.model.js');

    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}),
      TreatmentPlan.deleteMany({}), Invoice.deleteMany({}), Counter.deleteMany({}),
    ]);

    const tenant = await Tenant.create({
      name: 'Race Tenant', email: 'race@test.com', slug: 'race-tenant',
      plan: 'professional', status: 'active', isActive: true,
      settings: { maxBranches: 5, maxPatients: 100 },
    });
    tenantId = tenant._id;
    const branch = await Branch.create({
      tenant: tenantId, name: 'Race', address: '1 St', phone: '+1222000001', isActive: true,
    });
    branchId = branch._id;
  });

  afterAll(async () => {
    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}),
      TreatmentPlan.deleteMany({}), Invoice.deleteMany({}), Counter.deleteMany({}),
    ]);
    await mongoose.disconnect();
  });

  function makeRes() {
    const res = { statusCode: null, body: null };
    res.status = function (c) { this.statusCode = c; return this; };
    res.json = function (b) { this.body = b; return this; };
    return res;
  }

  async function runCancel(req) {
    const res = makeRes();
    const next = vi.fn();
    try {
      await controller.updateTreatmentItem(req, res, next);
      if (next.mock.calls.length) throw next.mock.calls[0][0];
      return { status: res.statusCode, body: res.body };
    } catch (err) {
      return { status: err.statusCode || 500, body: { message: err.message }, error: err };
    }
  }

  async function seedScenario(i) {
    const patient = await Patient.create({
      tenant: tenantId, branch: branchId, firstName: 'Race', lastName: `P${i}`,
      phone: `+1222000${String(seq++).padStart(5, '0')}`,
    });
    const plan = await TreatmentPlan.create({
      tenant: tenantId, branch: branchId, patient: patient._id,
      planNo: `RACE-${seq}`,
      title: 'Race plan',
      items: [{ procedureName: 'Cleaning', status: 'pending', estimatedCost: 100, tooth: null }],
    });
    return { patient, plan };
  }

  it('concurrent cancel + invoice on the same item: exactly one invoice, no desync, clean 409 (or 200) never 500', async () => {
    // Run the race on several fresh plans: every outcome must keep the
    // financial invariants, whichever transaction wins.
    for (let round = 0; round < 3; round++) {
      const { patient, plan } = await seedScenario(round);
      const itemId = plan.items[0]._id;
      const planId = plan._id;
      const patientId = patient._id;

      const { generateInvoiceFromPlan } = await import('../modules/emr/treatmentPlan.service.js');
      const planDoc = await TreatmentPlan.findById(planId);
      const patientDoc = await Patient.findById(patientId).lean();

      const cancelPromise = runCancel({
        params: { patientId: String(patientId), planId: String(planId), itemId: String(itemId) },
        validatedBody: { status: 'cancelled' },
        user: { _id: new mongoose.Types.ObjectId(), tenant: tenantId, branch: branchId },
        _roleResolved: { isSystemAdmin: false },
        isImpersonation: false,
      });
      const invoicePromise = generateInvoiceFromPlan(planDoc, patientDoc, {
        itemIds: [String(itemId)], discount: 0, tax: 0, notes: '', userId: null,
      });

      const [cancelOutcome, invoiceOutcome] = await Promise.allSettled([cancelPromise, invoicePromise]);

      // The invoice for a valid pending item never fails.
      expect(invoiceOutcome.status).toBe('fulfilled');

      // Exactly one invoice exists for the patient; the item points at it.
      const invoices = await Invoice.find({ patient: patientId, status: { $ne: 'void' } }).lean();
      expect(invoices).toHaveLength(1);
      expect(invoices[0].items).toHaveLength(1);

      const afterPlan = await TreatmentPlan.findById(planId).lean();
      const item = afterPlan.items[0];
      expect(item.invoice).toBeDefined();
      expect(String(item.invoice)).toBe(String(invoices[0]._id));

      // If the cancel LOST to the concurrent invoice, it must surface the
      // financial-freeze conflict (409), never a raw 500.
      if (cancelOutcome.status === 'fulfilled') {
        const r = cancelOutcome.value;
        if (r.status === 409) {
          expect(r.body.message).toMatch(/already been invoiced/);
        } else {
          // Cancel won the race but the invoice still landed on the item —
          // single invoice, single link; nothing desynced.
          expect([200, 201]).toContain(r.status);
          expect(item.status).toBe('cancelled');
        }
      } else {
        expect(cancelOutcome.reason.statusCode).not.toBe(500);
      }
    }
  });
});