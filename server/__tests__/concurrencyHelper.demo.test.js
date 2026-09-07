/**
 * Demo + self-test for the reusable concurrency helpers
 * (__tests__/helpers/concurrency.js).
 *
 * These tests re-implement two already-fixed regression scenarios using the
 * new helper instead of hand-rolled Promise.all, so the helper is proven to
 * work and doubles as documentation for future test authors.
 *
 *   1. Patient-slot atomic claim (HTTP-layer via `runConcurrent`):
 *      N concurrent createPatient calls where N-1 slots remain → exactly
 *      (N-1) succeed (201) and exactly 1 gets 409 — the atomic slot claim.
 *
 *   2. Treatment-plan double-invoice (service-layer via `runConcurrentCalls`):
 *      N concurrent generateInvoiceFromPlan calls on the same plan → exactly
 *      1 succeeds, the rest get a conflict — the transactional snapshot
 *      isolation re-read closing the double-invoice race.
 *
 * Uses a dedicated MongoDB database, matching the convention in
 * patientLimitLifecycle.integration.test.js.
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
// NOTE: the REAL withTransaction is intentionally left unmocked here so the
// concurrent transactions retry transient write-conflicts (as production
// does). A single-attempt mock would let the losers surface raw
// write-conflict errors instead of clean 409s.

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

import { runConcurrent, runConcurrentCalls } from './helpers/concurrency.js';

describe('helpers/concurrency — atomic claim under real concurrency', () => {
  const DB = 'mongodb://127.0.0.1:27017/dental_os_concurrency_helper_test';
  let Tenant, Branch, Patient, Counter, TreatmentPlan, DentalChart, Invoice, controller;
  let tenantId, branchId;
  let phoneSeq = 0;

  beforeAll(async () => {
    await mongoose.connect(DB);
    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Patient = (await import('../modules/patients/patient.model.js')).default;
    Counter = (await import('../core/counters.js')).default;
    TreatmentPlan = (await import('../modules/emr/treatmentPlan.model.js')).default;
    DentalChart = (await import('../modules/emr/dentalChart.model.js')).default;
    Invoice = (await import('../modules/billing/invoice.model.js')).default;
    controller = await import('../modules/patients/patient.controller.js');

    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}),
      Counter.deleteMany({}), TreatmentPlan.deleteMany({}), DentalChart.deleteMany({}),
      Invoice.deleteMany({}),
    ]);

    const tenant = await Tenant.create({
      name: 'Helper Demo', email: 'helper@test.com', slug: 'helper-demo',
      plan: 'professional', status: 'active', isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 3 },
    });
    tenantId = tenant._id;
    const branch = await Branch.create({ tenant: tenantId, name: 'Main', address: '1 St', phone: '+1000000001' });
    branchId = branch._id;
  });

  afterAll(async () => {
    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}),
      Counter.deleteMany({}), TreatmentPlan.deleteMany({}), DentalChart.deleteMany({}),
      Invoice.deleteMany({}),
    ]);
    await mongoose.disconnect();
  });

  function makeRes() {
    const res = { statusCode: null, body: null };
    res.status = function (c) { this.statusCode = c; return this; };
    res.json = function (b) { this.body = b; return this; };
    return res;
  }
  function makeReq(overrides = {}) {
    return {
      params: {}, query: {}, validatedQuery: { page: 1, limit: 20 },
      validatedBody: {}, user: { _id: new mongoose.Types.ObjectId(), tenant: tenantId, branch: branchId },
      _roleResolved: { isSystemAdmin: false }, isImpersonation: false,
      ...overrides,
    };
  }
  const phone = () => `+1888${String(phoneSeq++).padStart(4, '0')}`;

  async function runCreatePatient(req) {
    const res = makeRes();
    const next = vi.fn();
    try {
      await controller.createPatient(req, res, next);
      if (next.mock.calls.length) throw next.mock.calls[0][0];
      return { status: res.statusCode, body: res.body };
    } catch (err) {
      return { status: err.statusCode || 500, body: { message: err.message }, error: err };
    }
  }

  it('runConcurrent: with 1 free slot left, 2 concurrent creates → exactly 1 succeeds (201), 1 conflicts (409)', async () => {
    // Seed 2 of 3 allowed slots so exactly 1 slot is free.
    await controller.createPatient(
      makeReq({ validatedBody: { firstName: 'F', lastName: 'One', phone: phone() } }),
      makeRes(), vi.fn(),
    );
    await controller.createPatient(
      makeReq({ validatedBody: { firstName: 'F', lastName: 'Two', phone: phone() } }),
      makeRes(), vi.fn(),
    );

    // Fire 3 concurrent creates at the single remaining slot.
    const factory = () => runCreatePatient(
      makeReq({ validatedBody: { firstName: 'F', lastName: 'Three', phone: phone() } }),
    );

    const { successes, conflicts, others } = await runConcurrent(factory, 3, {
      exactlySuccessful: 1,
      exactlyConflict: 2,
      conflictStatus: 409,
    });

    expect(others).toHaveLength(0);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(2);
    expect(successes[0].status).toBe(201);
    // The counter never drifts: active records == used slots.
    const active = await Patient.countDocuments({ tenant: tenantId, isActive: true });
    const slot = await Counter.findById(`patient_slots:${String(tenantId)}`).lean();
    expect(active).toBe(3);
    expect(slot.seq).toBe(3);
  });

  it('runConcurrentCalls: generateInvoiceFromPlan on a shared plan → exactly 1 succeeds, rest conflict', async () => {
    const { generateInvoiceFromPlan } = await import('../modules/emr/treatmentPlan.service.js');

    // Seed a plan with some pending, un-invoiced items.
    const patient = await Patient.create({
      tenant: tenantId, branch: branchId, firstName: 'Inv', lastName: 'Plan', phone: phone(),
    });
    const plan = await TreatmentPlan.create({
      tenant: tenantId, branch: branchId, patient: patient._id,
      planNo: 'PLAN-HELPER',
      title: 'Race demo',
      items: [
        { procedureName: 'Cleaning', status: 'pending', estimatedCost: 100, tooth: null },
        { procedureName: 'Filling', status: 'pending', estimatedCost: 150, tooth: null },
      ],
    });

    const doc = await TreatmentPlan.findById(plan._id);
    const patientDoc = await Patient.findById(patient._id).lean();
    // Ensure referenced models are registered BEFORE the concurrent calls, so
    // lazy `mongoose.model("User")` lookups inside transactions don't race on
    // first use (MissingSchemaError under concurrency).
    await import('../modules/users/user.model.js');
    await import('../modules/users/branch.model.js');
    const makeCall = () => generateInvoiceFromPlan(doc, patientDoc, { userId: null });

    const { fulfilled, rejected } = await runConcurrentCalls(makeCall, 4);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    for (const r of rejected) {
      expect(r.reason.statusCode).toBe(409);
      expect(r.reason.message).toMatch(/already been invoiced/);
    }

    // Only ONE invoice exists with the plan's items linked.
    const invoices = await Invoice.find({ patient: patient._id }).lean();
    expect(invoices).toHaveLength(1);
    const relinked = await TreatmentPlan.findById(plan._id).lean();
    const invoicedItems = relinked.items.filter((i) => i.invoice);
    expect(invoicedItems).toHaveLength(2);
    for (const item of invoicedItems) {
      expect(String(item.invoice)).toBe(String(invoices[0]._id));
    }
  });
});
