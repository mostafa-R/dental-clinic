/**
 * Regression tests for the advance-booking window on RESCHEDULES.
 *
 * Audit concern: a booking/reschedule must respect the clinic's advance window
 * (PRD §9.3) — you cannot book a slot less than `minAdvanceMinutes` out or more
 * than `maxAdvanceDays` out. The window is enforced both when creating an
 * appointment AND when moving an existing one (reschedule), because both go
 * through User.isAvailableAt → assertDoctorAvailability.
 *
 * These tests pin that behaviour at the controller boundary with the shared
 * defaults (60 minutes min-advance / 90 days max-advance) on a doctor whose
 * appointmentSettings are left empty.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

const DB = 'mongodb://127.0.0.1:27017/dental_os_reschedule_advance_test';

const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;

// Defaults: cannot book < 60 minutes out or > 90 days out.
const MIN_ADVANCE_MS = 60 * MIN;
const MAX_ADVANCE_MS = 90 * DAY;

describe('advance-booking window on reschedules', () => {
  let Tenant;
  let Branch;
  let Patient;
  let User;
  let Appointment;
  let tenantAId;
  let branchAId;
  let doctor;
  let patient;
  let controller;
  let seq = 0;

  function nextUnique(prefix) {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
  }

  /** A weekday+working-hours start time inside the window (next working day 10:00). */
  function insideWindowStart() {
    const d = new Date();
    let days = 0;
    // advance until the next non-weekend day, then set a 10:00 slot > 60 min out.
    do {
      days += 1;
      d.setTime(Date.now() + days * DAY);
    } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    d.setUTCHours(10, 0, 0, 0);
    return d;
  }

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
      name: 'Clinic Resched A',
      email: 'clinic-resched-a@test.com',
      slug: 'clinic-resched-a',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 1000 },
    });
    tenantAId = tenantA._id;

    const branchA = await Branch.create({
      tenant: tenantAId,
      name: 'Branch Resched',
      address: '6 Main St',
      phone: '+1000000006',
      slotDuration: 30,
    });
    branchAId = branchA._id;

    const weekday = { open: '09:00', close: '17:00', notWorking: false };
    const workingHours = {
      sunday: { notWorking: true },
      monday: weekday,
      tuesday: weekday,
      wednesday: weekday,
      thursday: weekday,
      friday: weekday,
      saturday: { notWorking: true },
    };

    doctor = await User.create({
      tenant: tenantAId,
      branch: branchAId,
      name: 'Doc Resched',
      email: nextUnique('doc') + '@test.com',
      password: 'hashed-not-used',
      roleId: new mongoose.Types.ObjectId(),
      isDoctor: true,
      workingHours,
      appointmentSettings: {}, // default window applies
    });

    patient = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'First',
      lastName: 'Resched',
      phone: nextUnique('+12'),
    });

    await Appointment.init();
  });

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

  beforeEach(async () => {
    await Appointment.deleteMany({});
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
      user: { _id: new mongoose.Types.ObjectId(), tenant: tenantAId, branch: branchAId },
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

  async function createAt(start) {
    const d = String(doctor._id);
    const p = String(patient._id);
    const { res } = await run(
      controller.createAppointment,
      makeReq({
        validatedBody: { doctor: d, patient: p, chair: 'Resched Chair', start },
      }),
      makeRes(),
    );
    expect(res.statusCode).toBe(201);
    return res.body.data.appointment;
  }

  async function updateApp(id, body) {
    const { res, next } = await run(
      controller.updateAppointment,
      makeReq({
        params: { id: String(id) },
        validatedBody: body,
      }),
      makeRes(),
    );
    return { res, next };
  }

  function expectRejected(fn, pattern, statusCode) {
    const p = fn();
    // run() rethrows the asyncHandler error; assert on that rejection.
    return expect(p).rejects.toMatchObject({
      statusCode,
      message: expect.stringMatching(pattern),
    });
  }

  it('reschedule inside the window succeeds', async () => {
    const created = await createAt(insideWindowStart());
    const okStart = new Date(Date.now() + 2 * DAY);
    okStart.setUTCHours(11, 0, 0, 0);
    const { res } = await updateApp(created._id, { start: okStart.toISOString() });
    expect(res.statusCode).toBe(200);
  });

  it('reschedule to less than min-advance (60 min) is rejected', async () => {
    const created = await createAt(insideWindowStart());
    const tooSoon = new Date(Date.now() + 30 * MIN); // 30 min out < 60 min minimum
    await expectRejected(
      () => updateApp(created._id, { start: tooSoon.toISOString() }),
      /at least .* minutes in advance/i,
      400,
    );
  });

  it('reschedule beyond max-advance (90 days) is rejected', async () => {
    const created = await createAt(insideWindowStart());
    const tooFar = new Date(Date.now() + 120 * DAY); // 120 days out > 90 day max
    await expectRejected(
      () => updateApp(created._id, { start: tooFar.toISOString() }),
      /up to .* days in advance/i,
      400,
    );
  });

  it('default doctor window uses the shared constants (60 min / 90 days)', async () => {
    const reloaded = await User.findById(doctor._id).select('appointmentSettings').lean();
    expect(reloaded.appointmentSettings.minAdvanceMinutes).toBe(60);
    expect(reloaded.appointmentSettings.maxAdvanceDays).toBe(90);
  });
});
