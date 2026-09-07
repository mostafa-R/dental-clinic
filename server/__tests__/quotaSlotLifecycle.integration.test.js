/**
 * Integration tests (real replica-set MongoDB) for the new ATOMIC quota
 * enforcement on branch + doctor creation (regression for the TOCTOU
 * read-then-create cap enforcement found in the concurrency audit):
 *
 *   - createBranch (clinic-owner + site-admin paths) claims a per-tenant
 *     `branch_slots:<tenant>` slot inside the SAME transaction as the insert,
 *     so N concurrent creates at the cap cannot all pass a stale count.
 *   - deleteBranch releases the slot in the same transaction, so deleting a
 *     branch frees quota again (mirrors releasePatientSlot).
 *   - createUser claims a per-tenant `doctor_slots:<tenant>` slot for
 *     doctor-role users; concurrent creates can never overshoot maxDoctors.
 *
 * The REAL withTransaction is intentionally left unmocked so concurrent
 * transactions retry transient write-conflicts exactly like production.
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
  invalidatePermission: vi.fn(),
}));
vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn(() => {}), emitToTenant: vi.fn(() => {}),
}));

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

import { runConcurrent } from './helpers/concurrency.js';

describe('Atomic quota slots — branches + doctors', () => {
  const DB = 'mongodb://127.0.0.1:27017/dental_os_quota_slot_test';
  let Tenant, Branch, User, Role, Counter, branchController, userController;
  let tenantId, mainBranchId, doctorRoleId;
  let nameSeq = 0, emailSeq = 0;

  beforeAll(async () => {
    await mongoose.connect(DB);

    // Pre-register every referenced model BEFORE the concurrent calls so lazy
    // `mongoose.model(...)` lookups inside transactions never race on first
    // use (MissingSchemaError under concurrency).
    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    User = (await import('../modules/users/user.model.js')).default;
    Role = (await import('../modules/users/role.model.js')).default;
    Counter = (await import('../core/counters.js')).default;
    branchController = await import('../modules/users/branch.controller.js');
    userController = await import('../modules/users/user.controller.js');

    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), User.deleteMany({}),
      Role.deleteMany({}), Counter.deleteMany({}),
    ]);

    const tenant = await Tenant.create({
      name: 'Slot Tenant', email: 'slots@test.com', slug: 'slot-tenant',
      plan: 'professional', status: 'active', isActive: true,
      settings: { maxBranches: 2, maxDoctors: 3, maxPatients: 100 },
    });
    tenantId = tenant._id;

    const main = await Branch.create({
      tenant: tenantId, name: 'Main', address: '1 St', phone: '+1000000001', isActive: true,
    });
    mainBranchId = main._id;

    // The default branch is seeded to 1 by createTenant at tenant creation;
    // reproduce that seed here so the slot counter matches the one real branch.
    await Counter.updateOne(
      { _id: `branch_slots:${String(tenantId)}` },
      { $setOnInsert: { seq: 1 } },
      { upsert: true },
    );

    const doctorRole = await Role.create({
      tenant: tenantId, name: 'Doctor', key: 'doctor', permissions: [],
    });
    doctorRoleId = doctorRole._id;

    // Seed the doctor slot to 0 (no doctors yet). Creating the counter doc
    // UPFRONT avoids the raw-upsert-on-missing-_id race (E11000 under 5
    // simultaneous first-ever claims); with the doc present, every claim is a
    // plain serialized $inc and the cap resolution shows up as clean 409s.
    await Counter.updateOne(
      { _id: `doctor_slots:${String(tenantId)}` },
      { $setOnInsert: { seq: 0 } },
      { upsert: true },
    );
  });

  afterAll(async () => {
    await Promise.all([
      Tenant.deleteMany({}), Branch.deleteMany({}), User.deleteMany({}),
      Role.deleteMany({}), Counter.deleteMany({}),
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
      params: {}, query: {}, validatedBody: {},
      user: { _id: new mongoose.Types.ObjectId(), tenant: tenantId, branch: mainBranchId },
      _roleResolved: { isSystemAdmin: false }, isImpersonation: false,
      ...overrides,
    };
  }

  const branchName = () => `Branch ${String(nameSeq++).padStart(3, '0')}`;
  const doctorEmail = () => `doctor${String(emailSeq++).padStart(3, '0')}@slot.test`;

  async function runCreateBranch(req) {
    const res = makeRes();
    const next = vi.fn();
    try {
      await branchController.createBranch(req, res, next);
      if (next.mock.calls.length) throw next.mock.calls[0][0];
      return { status: res.statusCode, body: res.body };
    } catch (err) {
      return { status: err.statusCode || 500, body: { message: err.message }, error: err };
    }
  }

  it('concurrent createBranch at the cap: exactly 1 succeeds, rest get 400 (atomic slot claim)', async () => {
    // Tenant has 1 default branch + maxBranches=2, so only ONE more slot is free.
    const factory = () => runCreateBranch(
      makeReq({ validatedBody: { name: branchName(), address: '2 St', phone: '+1000000002' } }),
    );

    const { successes, conflicts, others } = await runConcurrent(factory, 3, {
      exactlySuccessful: 1,
      exactlyConflict: 2,
      conflictStatus: 400,
    });

    expect(others).toHaveLength(0);
    expect(successes[0].status).toBe(201);

    // Counter and reality are aligned — never more than maxBranches.
    const slot = await Counter.findById(`branch_slots:${String(tenantId)}`).lean();
    const live = await Branch.countDocuments({ tenant: tenantId });
    expect(slot.seq).toBe(2);
    expect(live).toBe(2);
  });

  it('deleting a branch releases its slot, so a new branch can be created (regression)', async () => {
    // The previous test left exactly one controller-created branch ('Main' + 1).
    const created = await Branch.findOne({ tenant: tenantId, name: { $ne: 'Main' } });
    expect(created).toBeDefined();

    const deleteRes = makeRes();
    await branchController.deleteBranch(
      makeReq({ params: { id: String(created._id) } }),
      deleteRes, vi.fn(),
    );
    expect(deleteRes.statusCode).toBe(200);

    const slotAfterDelete = await Counter.findById(`branch_slots:${String(tenantId)}`).lean();
    expect(slotAfterDelete.seq).toBe(1);
    expect(await Branch.countDocuments({ tenant: tenantId })).toBe(1);

    // Slot freed → a new create succeeds again.
    const res = makeRes();
    const next = vi.fn();
    await branchController.createBranch(
      makeReq({ validatedBody: { name: branchName(), address: '3 St', phone: '+1000000003' } }),
      res, next,
    );
    expect(next.mock.calls).toHaveLength(0);
    expect(res.statusCode).toBe(201);

    const slot = await Counter.findById(`branch_slots:${String(tenantId)}`).lean();
    expect(slot.seq).toBe(2);
  });

  it('concurrent createUser (doctor): exactly maxDoctors win, rest get 409 (atomic slot claim)', async () => {
    async function runCreateDoctor(i) {
      const res = makeRes();
      const next = vi.fn();
      try {
        await userController.createUser(
          makeReq({
            validatedBody: {
              name: `Doc ${i}`,
              email: doctorEmail(),
              password: 'Password123!',
              phone: `+1555${String(i).padStart(5, '0')}`,
              roleId: String(doctorRoleId),
              branch: String(mainBranchId),
              isDoctor: true,
            },
          }),
          res, next,
        );
        if (next.mock.calls.length) throw next.mock.calls[0][0];
        return { status: res.statusCode, body: res.body };
      } catch (err) {
        return { status: err.statusCode || 500, body: { message: err.message }, error: err };
      }
    }

    // 5 simultaneous creates against a maxDoctors=3 plan → exactly 3 win.
    const { successes, conflicts, others } = await runConcurrent(
      () => runCreateDoctor(Math.floor(Math.random() * 1e6)),
      5,
      { exactlySuccessful: 3, exactlyConflict: 2, conflictStatus: 409 },
    );

    expect(others).toHaveLength(0);
    for (const c of conflicts) {
      expect(c.body.message).toMatch(/maximum of 3 doctors/);
    }

    const slot = await Counter.findById(`doctor_slots:${String(tenantId)}`).lean();
    const live = await User.countDocuments({ tenant: tenantId, isDoctor: true });
    expect(slot.seq).toBe(3);
    expect(live).toBe(3);
  });
});