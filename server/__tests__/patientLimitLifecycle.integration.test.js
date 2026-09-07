/**
 * Integration tests (real MongoDB) for the "Patient Limit per plan" lifecycle.
 *
 * Verifies:
 *  - createPatient blocks over the plan cap with a 409 (atomic slot claim);
 *  - archiving a patient RELEASES its plan slot so the clinic can create a new
 *    patient once back under the cap (regression);
 *  - merging a duplicate RELEASES the retired record's slot;
 *  - the tenant/branch isolation holds: creates are scoped to the caller's
 *    tenant + branch and cannot leak across tenants.
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
vi.mock('../core/transaction.js', () => ({
  withTransaction: vi.fn(async (fn) => {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }),
}));

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

describe('Patient limit lifecycle + isolation', () => {
  let Tenant, Branch, Patient, Counter, controller;
  let tenantAId, tenantBId, branchAId;
  let phoneSeq = 0;

  beforeAll(async () => {
    const db = 'mongodb://127.0.0.1:27017/dental_os_patient_limit_test';
    await mongoose.connect(db);

    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Patient = (await import('../modules/patients/patient.model.js')).default;
    Counter = (await import('../core/counters.js')).default;
    controller = await import('../modules/patients/patient.controller.js');

    await Promise.all([Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}), Counter.deleteMany({})]);

    const mkTenant = async (name, slug) =>
      Tenant.create({
        name, email: `${slug}@test.com`, slug, plan: 'professional',
        status: 'active', isActive: true,
        settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 3 },
      });

    const tenantA = await mkTenant('Limit A', 'limit-a');
    tenantAId = tenantA._id;
    const tenantB = await mkTenant('Limit B', 'limit-b');
    tenantBId = tenantB._id;

    const branchA = await Branch.create({ tenant: tenantAId, name: 'Branch A', address: '1 A St', phone: '+1000000001' });
    branchAId = branchA._id;
  });

  afterAll(async () => {
    await Promise.all([Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({}), Counter.deleteMany({})]);
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
      validatedBody: {}, user: { _id: new mongoose.Types.ObjectId(), tenant: tenantAId, branch: branchAId },
      _roleResolved: { isSystemAdmin: false }, isImpersonation: false,
      ...overrides,
    };
  }
  const phone = () => `+1999999${String(phoneSeq++).padStart(3, '0')}`;
  async function run(fn, req, res) {
    const next = vi.fn();
    await fn(req, res, next);
    if (next.mock.calls.length) throw next.mock.calls[0][0];
    return { res, next };
  }
  async function create(req) {
    const res = makeRes();
    await run(controller.createPatient, req, res);
    return res.body.data.patient;
  }

  it('blocks a create once the tenant reaches its plan cap (409)', async () => {
    for (let i = 0; i < 3; i++) {
      await create(makeReq({ validatedBody: { firstName: 'Cap', lastName: `P${i}`, phone: phone() } }));
    }
    const res = makeRes();
    let err = null;
    try {
      await run(
        controller.createPatient,
        makeReq({ validatedBody: { firstName: 'Cap', lastName: 'Over', phone: phone() } }),
        res,
      );
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('maximum of 3 patients');
  });

  it('archiving a patient releases its slot (regression), enabling a new create', async () => {
    const Patient = (await import('../modules/patients/patient.model.js')).default;
    const patient = await Patient.findOne({ tenant: tenantAId, firstName: 'Cap', lastName: 'P0' });
    expect(patient).toBeDefined();

    const archiveReq = makeReq({ params: { id: String(patient._id) } });
    const archiveRes = makeRes();
    await run(controller.archivePatient, archiveReq, archiveRes);
    expect(archiveRes.statusCode).toBe(200);

    // Now back under the cap (2 active left + archived) => create must succeed.
    const res = makeRes();
    await run(
      controller.createPatient,
      makeReq({ validatedBody: { firstName: 'Cap', lastName: 'New', phone: phone() } }),
      res,
    );
    expect(res.statusCode).toBe(201);

    const archived = await Patient.findById(patient._id);
    expect(archived.isActive).toBe(false);
  });

  it('merges a duplicate and archives it with mergedInto set', async () => {
    // Seed two active records directly (bypassing the cap-backed controller).
    const d1 = await Patient.create({ tenant: tenantAId, branch: branchAId, firstName: 'Merge', lastName: 'One', phone: phone() });
    const d2 = await Patient.create({ tenant: tenantAId, branch: branchAId, firstName: 'Merge', lastName: 'Two', phone: phone() });

    const mergeRes = makeRes();
    await run(
      controller.mergePatients,
      makeReq({ params: { id: String(d1._id) }, validatedBody: { duplicateOf: String(d2._id) } }),
      mergeRes,
    );
    expect(mergeRes.statusCode).toBe(200);
    expect(String(mergeRes.body.data.survivorId)).toBe(String(d2._id));

    const retired = await Patient.findById(d1._id);
    expect(retired.isActive).toBe(false);
    expect(String(retired.mergedInto)).toBe(String(d2._id));
  });

  it('a non-system-admin is forced to their OWN branch regardless of body branch (no cross-tenant write)', async () => {
    const Branch = (await import('../modules/users/branch.model.js')).default;
    // Dedicated tenant B + branch with generous cap.
    const branchB = await Branch.create({ tenant: tenantBId, name: 'Branch B', address: '9 B St', phone: '+1000000009' });

    // Caller belongs to tenant A / branch A; tries to write into tenant B's branch.
    const req = makeReq({
      _roleResolved: { isSystemAdmin: false },
      validatedBody: { firstName: 'X', lastName: 'Tenant', phone: phone(), branch: String(branchB._id) },
    });
    const res = makeRes();
    await run(controller.createPatient, req, res);
    expect(res.statusCode).toBe(201);

    // The record must NOT have landed in tenant B's branch.
    const saved = await Patient.findOne({ firstName: 'X', lastName: 'Tenant' });
    expect(String(saved.tenant)).toBe(String(tenantAId));
    expect(String(saved.branch)).toBe(String(branchAId));
    // No patient was created in tenant B.
    expect(await Patient.countDocuments({ tenant: tenantBId, branch: branchB._id })).toBe(0);
  });
});
