/**
 * Concurrency regression tests for the appointments double-booking guards.
 *
 * The app-level overlap checks (doctor/patient/chair) are check-then-insert:
 * two requests can BOTH pass them and then both write. The fixes under test
 * make those races impossible at the DB layer:
 *
 *  - `chairKey`: a canonical identity for the physical chair (case/punctuation
 *    insensitive) so "Chair 01", "chair-01", "Chair_01" are the same chair.
 *  - partial unique indexes on { branch, patient, start } and
 *    { branch, chairKey, start } reject the losing concurrent insert
 *    (E11000), which the controller maps to 409.
 *
 * Tests drive the REAL controller against a REAL MongoDB, firing genuinely
 * concurrent requests via helpers/concurrency.js (promises built first, then
 * awaited together).
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
  emitToTenantQueue: vi.fn(() => {}),
}));

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

import { canonicalChairKey } from '../modules/appointments/chairKey.js';

const DB = 'mongodb://127.0.0.1:27017/dental_os_appointment_concurrency_test';

// Tuesday 2026-09-15, 09:00–09:30. Within the doctor's Mon–Fri 09:00–17:00
// working hours AND inside the (now+1h, now+90d] advance-booking window, so
// the only thing that can reject a request is the double-booking guard.
const SLOT_START = new Date(Date.UTC(2026, 8, 15, 9, 0, 0));
const SLOT_END = new Date(Date.UTC(2026, 8, 15, 9, 30, 0));

describe('Appointment double-booking guards (real concurrency)', () => {
  let Tenant;
  let Branch;
  let Patient;
  let User;
  let Appointment;
  let tenantAId;
  let branchAId;
  let doctors = [];
  let patients = [];
  let controller;
  let seq = 0;

  function nextUnique(prefix) {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
  }

  // Generous hook timeout: a cold Mongo connection in a fresh worker can take
  // several seconds longer than vitest's 10s default, which made this suite
  // flaky/fail on CI despite a healthy replica set.
  beforeAll(async () => {
    await mongoose.connect(DB);

    Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;
    Branch = (await import('../modules/users/branch.model.js')).default;
    Patient = (await import('../modules/patients/patient.model.js')).default;
    User = (await import('../modules/users/user.model.js')).default;
    Appointment = (await import('../modules/appointments/appointment.model.js')).default;
    controller = await import('../modules/appointments/appointment.controller.js');

    await Promise.all([
      Tenant.deleteMany({}),
      Branch.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
      Appointment.deleteMany({}),
    ]);

    const tenantA = await Tenant.create({
      name: 'Clinic Concurrency A',
      email: 'clinic-concurrency-a@test.com',
      slug: 'clinic-concurrency-a',
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
      phone: '+1000000001',
    });
    branchAId = branchA._id;

    const monday = { notWorking: false, open: '09:00', close: '17:00' };
    const workingHours = {
      sunday: { notWorking: true },
      monday,
      tuesday: monday,
      wednesday: monday,
      thursday: monday,
      friday: monday,
      saturday: { notWorking: true },
    };

    for (let i = 0; i < 16; i += 1) {
      const doctor = await User.create({
        tenant: tenantAId,
        branch: branchAId,
        name: `Doctor ${i}`,
        email: nextUnique('doctor') + '@test.com',
        password: 'hashed-not-used',
        roleId: new mongoose.Types.ObjectId(),
        isDoctor: true,
        workingHours,
        appointmentSettings: {},
      });
      doctors.push(doctor);
    }

    for (let i = 0; i < 16; i += 1) {
      const patient = await Patient.create({
        tenant: tenantAId,
        branch: branchAId,
        firstName: 'First',
        lastName: `Patient ${i}`,
        phone: nextUnique('+10'),
      });
      patients.push(patient);
    }

    await Appointment.init(); // ensure partial unique indexes exist first
  }, 120000);

  afterAll(async () => {
    await Promise.all([
      Tenant.deleteMany({}),
      Branch.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
      Appointment.deleteMany({}),
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

  function createRequest({ doctor, patient, chair, start = SLOT_START, end = SLOT_END, status = 'scheduled' }) {
    return () =>
      run(
        controller.createAppointment,
        makeReq({
          validatedBody: { doctor: String(doctor._id), patient: String(patient._id), chair, start, end, status },
        }),
        makeRes(),
      );
  }

  it('canonicalChairKey collapses case and punctuation variants of the same chair', () => {
    expect(canonicalChairKey('Chair 01')).toBe('CHAIR01');
    expect(canonicalChairKey('chair-01')).toBe('CHAIR01');
    expect(canonicalChairKey(' Chair_01 ')).toBe('CHAIR01');
    expect(canonicalChairKey('DR 2 A')).toBe('DR2A');
    expect(canonicalChairKey('')).toBe('');
    expect(canonicalChairKey(null)).toBe('');
  });

  it('the unique index rejects direct model writes whose canonical chairKey collides', async () => {
    const first = await Appointment.create({
      tenant: tenantAId,
      branch: branchAId,
      patient: patients[0]._id,
      doctor: doctors[0]._id,
      chair: ' Chair 01 ',
      start: SLOT_START,
      end: SLOT_END,
      status: 'scheduled',
    });
    expect(first.chairKey).toBe('CHAIR01');
    expect(first.chair).toBe('Chair 01');

    let blocked = false;
    try {
      await Appointment.create({
        tenant: tenantAId,
        branch: branchAId,
        patient: patients[1]._id,
        doctor: doctors[1]._id,
        chair: 'chair-01',
        start: SLOT_START,
        end: SLOT_END,
        status: 'scheduled',
      });
    } catch (err) {
      blocked = err?.code === 11000;
    }
    expect(blocked).toBe(true);
  });

  it('allows the same chair at a different, non-overlapping time', async () => {
    const later = await Appointment.create({
      tenant: tenantAId,
      branch: branchAId,
      patient: patients[1]._id,
      doctor: doctors[1]._id,
      chair: 'Chair 01',
      start: new Date(Date.UTC(2026, 8, 15, 10, 0, 0)),
      end: new Date(Date.UTC(2026, 8, 15, 10, 30, 0)),
      status: 'scheduled',
    });
    expect(later).toBeDefined();
  });

  it('allows different chairs at the same time', async () => {
    const other = await Appointment.create({
      tenant: tenantAId,
      branch: branchAId,
      patient: patients[2]._id,
      doctor: doctors[2]._id,
      chair: 'Chair ZZ',
      start: SLOT_START,
      end: SLOT_END,
      status: 'scheduled',
    });
    expect(other).toBeDefined();
  });

  it('single createRequest persists one appointment with chairKey (sanity)', async () => {
    const single = await createRequest({
      doctor: doctors[7],
      patient: patients[7],
      chair: 'Sanity Chair',
      start: new Date(Date.UTC(2026, 8, 15, 11, 0, 0)),
      end: new Date(Date.UTC(2026, 8, 15, 11, 30, 0)),
    })();
    expect(single.res.statusCode).toBe(201);
    const saved = await Appointment.findById(single.res.body.data.appointment._id)
      .select('chair chairKey start end status').lean();
    expect(saved.chairKey).toBe('SANITYCHAIR');
  });

  it('concurrent same-chair booking: exactly one wins, the rest get 409 (never a silent double-book)', async () => {
    const concurrency = 5;
    // Each request uses a DISTINCT doctor+patient so the doctor/patient
    // overlap guards cannot fire — ONLY the chairKey unique index can reject
    // the losers. All share the same canonical chair and the same exact start.
    const requests = Array.from(
      { length: concurrency },
      (_, i) => createRequest({
        doctor: doctors[5 + i],
        patient: patients[5 + i],
        chair: 'Concurrency Chair A',
      })(),
    );
    const settled = await Promise.allSettled(requests);
    const fulfilled = settled.filter((r) => r.status === 'fulfilled');
    const rejected = settled.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(concurrency - 1);
    for (const { reason } of rejected) {
      expect(reason?.statusCode).toBe(409);
    }
  });

  it('concurrent same-patient booking: exactly one wins, the rest get 409', async () => {
    const concurrency = 5;
    // Distinct chairs + distinct doctors so only the {branch, patient, start}
    // unique index rejects the losers. The patient is shared across requests.
    const requests = Array.from(
      { length: concurrency },
      (_, i) => createRequest({
        doctor: doctors[10 + i],
        patient: patients[10],
        chair: `Patient Concurrency Chair ${i}`,
      })(),
    );
    const settled = await Promise.allSettled(requests);
    const fulfilled = settled.filter((r) => r.status === 'fulfilled');
    const rejected = settled.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(concurrency - 1);
    for (const { reason } of rejected) {
      expect(reason?.statusCode).toBe(409);
    }
  });

  it('same chair/patient/doctor slot can be reused AFTER the first is cancelled (partial index releases it)', async () => {
    const base = await createRequest({
      doctor: doctors[1],
      patient: patients[1],
      chair: 'Reuse Chair',
    })();
    expect(base.res.statusCode).toBe(201);

    await Appointment.updateOne(
      { _id: base.res.body.data.appointment._id },
      { $set: { status: 'cancelled' } },
    );

    const reuse = await createRequest({
      doctor: doctors[1],
      patient: patients[1],
      chair: 'Reuse Chair',
    })();
    expect(reuse.res.statusCode).toBe(201);
  });
});