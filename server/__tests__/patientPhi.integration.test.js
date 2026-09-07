/**
 * Integration tests (real MongoDB) for the "Patient unified file + Patient ID
 * serial + PHI" feature.
 *
 * Verifies:
 *  - the patient ID serial (PT-00001, PT-00002, ...) is issued from the
 *    per-tenant Counter and never repeated within a tenant;
 *  - PHI fields are stripped from controller responses during impersonation,
 *    including the duplicate-group projection (regression);
 *  - the phone-per-branch unique backstop index rejects duplicate phones.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../utils/cache.js', () => ({
  getCachedTenant: vi.fn(() => null),
  cacheTenant: vi.fn(),
  invalidateTenant: vi.fn(),
  getCachedRole: vi.fn(() => null),
  cacheRole: vi.fn(),
}));

vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn(() => {}),
  emitToTenant: vi.fn(() => {}),
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

// Import eventBus so the real createPatient publish uses a real (harmless) impl.
const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

const PHI_PATH =
  'C:/Users/mostafa/Desktop/dental-clinic/server/modules/patients/patient.controller.js';

describe('Patient feature — ID serial + PHI', () => {
  let Tenant;
  let Branch;
  let Patient;
  let Counter;
  let tenantAId;
  let branchAId;
  let controller;

  beforeAll(async () => {
    const testDbUri =
      process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_patient_phi_test';
    await mongoose.connect(testDbUri);

    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Patient = (await import('../modules/patients/patient.model.js')).default;
    Counter = (await import('../core/counters.js')).default;
    controller = await import('../modules/patients/patient.controller.js');

    await Promise.all([
      Tenant.deleteMany({}),
      Branch.deleteMany({}),
      Patient.deleteMany({}),
      Counter.deleteMany({}),
    ]);

    const tenantA = await Tenant.create({
      name: 'Clinic PHI A',
      email: 'clinic-phi-a@test.com',
      slug: 'clinic-phi-a',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 1000 },
    });
    tenantAId = tenantA._id;

    const branchA = await Branch.create({
      tenant: tenantAId,
      name: 'Branch A',
      address: '1 Main St',
      phone: '+1111111111',
    });
    branchAId = branchA._id;
  });

  afterAll(async () => {
    await Promise.all([
      Tenant.deleteMany({}),
      Branch.deleteMany({}),
      Patient.deleteMany({}),
      Counter.deleteMany({}),
    ]);
    await mongoose.disconnect();
  });

  function makeRes() {
    const res = { statusCode: null, body: null, locals: {} };
    res.status = function (code) {
      this.statusCode = code;
      return this;
    };
    res.json = function (body) {
      this.body = body;
      return this;
    };
    return res;
  }

  function makeReq(overrides = {}) {
    return {
      params: {},
      query: {},
      validatedQuery: { page: 1, limit: 20 },
      validatedBody: {},
      user: {
        _id: new mongoose.Types.ObjectId(),
        tenant: tenantAId,
        branch: branchAId,
      },
      _roleResolved: { isSystemAdmin: false },
      isImpersonation: false,
      ...overrides,
    };
  }

  async function run(fn, req, res) {
    const next = vi.fn();
    await fn(req, res, next);
    if (next.mock.calls.length) throw next.mock.calls[0][0];
    return { res, next };
  }

  it('issues sequential per-tenant patient IDs (PT-00001, PT-00002, ...)', async () => {
    const p1 = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Serial',
      lastName: 'One',
      phone: '+1000000101',
    });
    const p2 = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Serial',
      lastName: 'Two',
      phone: '+1000000102',
    });
    expect(p1.patientId).toBe('PT-00001');
    expect(p2.patientId).toBe('PT-00002');
  });

  it('listPatients strips PHI when impersonating', async () => {
    await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Phi',
      lastName: 'List',
      phone: '+1000000201',
      email: 'phi-list@test.com',
      address: '42 Hidden St',
      dateOfBirth: new Date('1980-01-01'),
    });
    const res = makeRes();
    await run(
      controller.listPatients,
      makeReq({ isImpersonation: true, validatedQuery: { page: 1, limit: 20, search: '' } }),
      res,
    );

    const patients = res.body.data.patients;
    const target = patients.find((p) => p.lastName === 'List');
    expect(target).toBeDefined();
    expect(target.phone).toBeUndefined();
    expect(target.email).toBeUndefined();
    expect(target.address).toBeUndefined();
    expect(target.dateOfBirth).toBeUndefined();
    expect(target.firstName).toBe('Phi');
    expect(target.patientId).toBeDefined();
  });

  it('findDuplicatePatients does NOT leak PHI when impersonating (name+dob group)', async () => {
    // The unique phone index prevents true phone duplicates, so use the
    // name+DOB duplicate signal (which the schema does not constrain).
    await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Dup',
      lastName: 'GrpOne',
      phone: '+1000000300',
      dateOfBirth: new Date('1985-02-02'),
      email: 'dup-grp-one@test.com',
    });
    await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: ' Dup ',
      lastName: ' GrpOne ',
      phone: '+1000000301',
      dateOfBirth: new Date('1985-02-02'),
      email: 'dup-grp-two@test.com',
    });

    const res = makeRes();
    await run(controller.findDuplicatePatients, makeReq({ isImpersonation: true }), res);

    const { groups } = res.body.data;
    const nameDob = groups.find((g) => g.matchedOn === 'name+dob');
    expect(nameDob).toBeDefined();
    expect(nameDob.patients.length).toBe(2);
    for (const p of nameDob.patients) {
      // Regression: phone/email must never reach an impersonation response.
      expect(p.phone).toBeUndefined();
      expect(p.email).toBeUndefined();
    }
    // Regression: the name+dob group KEY embeds the DOB (a PHI field) — it
    // must be redacted during impersonation.
    expect(nameDob.key).toBe('[redacted name + dob]');
    expect(JSON.stringify(groups)).not.toContain('1985-02-02');
  });

  it('phone unique backstop index rejects a second patient with the same phone in a branch', async () => {
    await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Index',
      lastName: 'One',
      phone: '+1000000400',
    });
    let blocked = false;
    try {
      await Patient.create({
        tenant: tenantAId,
        branch: branchAId,
        firstName: 'Index',
        lastName: 'Two',
        phone: '+1000000400',
      });
    } catch (err) {
      blocked = err?.code === 11000;
    }
    expect(blocked).toBe(true);
  });
});
