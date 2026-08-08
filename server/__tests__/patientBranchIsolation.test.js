/**
 * Regression test for cross-tenant patient branch reassignment.
 *
 * A system admin may move a patient to another branch, but the target branch
 * MUST belong to the patient's own tenant. Before the fix, PATCH /patients/:id
 * with { branch: "<branch-of-tenant-B>" } silently moved the patient, exposing
 * their PHI to staff of tenant B.
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
}));

describe('Patient branch reassignment isolation', () => {
  let tenantAId;
  let tenantBId;
  let branchAId;
  let branchBId;

  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    await mongoose.connect(testDbUri);

    const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    const Branch = (await import('../modules/users/branch.model.js')).default;
    const Patient = (await import('../modules/patients/patient.model.js')).default;

    await Promise.all([Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({})]);

    const tenantA = await Tenant.create({
      name: 'Clinic A',
      email: 'clinic-a-pbi@test.com',
      slug: 'clinic-a-pbi',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10 },
    });
    tenantAId = tenantA._id;

    const tenantB = await Tenant.create({
      name: 'Clinic B',
      email: 'clinic-b-pbi@test.com',
      slug: 'clinic-b-pbi',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10 },
    });
    tenantBId = tenantB._id;

    const branchA = await Branch.create({
      tenant: tenantAId,
      name: 'Branch A',
      address: '123 Street A',
      phone: '+1111111111',
    });
    branchAId = branchA._id;

    const branchB = await Branch.create({
      tenant: tenantBId,
      name: 'Branch B',
      address: '456 Street B',
      phone: '+2222222222',
    });
    branchBId = branchB._id;
  });

  afterAll(async () => {
    const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    const Branch = (await import('../modules/users/branch.model.js')).default;
    const Patient = (await import('../modules/patients/patient.model.js')).default;

    await Promise.all([Tenant.deleteMany({}), Branch.deleteMany({}), Patient.deleteMany({})]);
    await mongoose.disconnect();
  });

  function makeReq(overrides = {}) {
    return {
      params: { id: overrides.patientId },
      user: {
        _id: new mongoose.Types.ObjectId(),
        tenant: tenantAId,
        branch: branchAId,
      },
      _roleResolved: { isSystemAdmin: true },
      validatedBody: { branch: overrides.branch },
      isImpersonation: false,
      query: {},
    };
  }

  function makeRes() {
    const res = { statusCode: null, body: null };
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body) => {
      res.body = body;
      return res;
    };
    return res;
  }

  it('should block reassigning a patient to a branch of another tenant', async () => {
    const Patient = (await import('../modules/patients/patient.model.js')).default;
    const patient = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Cross',
      lastName: 'Tenant',
      phone: '+1000000000',
    });

    const { updatePatient } = await import('../modules/patients/patient.controller.js');
    const req = makeReq({ patientId: patient._id, branch: branchBId });
    const res = makeRes();

    let nextErr = null;
    await updatePatient(req, res, (err) => { nextErr = err; });

    expect(nextErr).toBeDefined();
    expect(nextErr.statusCode).toBe(400);

    // Patient must be untouched — still in tenant A / branch A.
    const reloaded = await Patient.findById(patient._id);
    expect(String(reloaded.tenant)).toBe(String(tenantAId));
    expect(String(reloaded.branch)).toBe(String(branchAId));
  });

  it('should allow reassigning a patient within the same tenant', async () => {
    const Branch = (await import('../modules/users/branch.model.js')).default;
    const Patient = (await import('../modules/patients/patient.model.js')).default;

    // Second branch belonging to the SAME tenant.
    const branchA2 = await Branch.create({
      tenant: tenantAId,
      name: 'Branch A2',
      address: '789 Street A',
      phone: '+3333333333',
    });

    const patient = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Same',
      lastName: 'Tenant',
      phone: '+1000000001',
    });

    const { updatePatient } = await import('../modules/patients/patient.controller.js');
    const req = makeReq({ patientId: patient._id, branch: branchA2._id });
    const res = makeRes();

    let nextErr = null;
    await updatePatient(req, res, (err) => { nextErr = err; });

    expect(nextErr).toBeUndefined();
    expect(res.statusCode).toBe(200);

    const reloaded = await Patient.findById(patient._id);
    expect(String(reloaded.branch)).toBe(String(branchA2._id));
  });
});
