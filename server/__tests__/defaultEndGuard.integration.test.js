/**
 * Regression tests for the "missing end-time bypasses all guards" bug.
 *
 * The old controller left `end` as null whenever the client omitted it (and
 * `slots` was not sent), and every guard — clinic hours, doctor availability,
 * doctor/patient/chair overlap — silently `return`ed in that case. A booking
 * with only a start time therefore skipped ALL conflict/availability checks
 * and still got created.
 *
 * Fix under test: `end` is always resolved (branch slotDuration × (slots ?? 1))
 * before any guard runs; a missing `start` is rejected outright; update keeps
 * an appointment's existing length when only the start moves and heals legacy
 * end-less rows; and the guards themselves now throw rather than skip when a
 * time part is missing.
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

const DB = 'mongodb://127.0.0.1:27017/dental_os_default_end_test';

// All slots derive from a future Wednesday 09:00 UTC seeded from "now", so the
// suite never rots as real time passes: every start sits on a Mon–Fri 09:00–17:00
// working day inside the (now+1h, now+90d] advance-booking window, and
// 09:00–(09:00+45min)=09:45 stays inside working hours (previously hardcoded
// 2026-09-16 dates quickly became a date-bomb once that day passed).
function nextWeekdayUtc(weekday, hour, minDaysAhead = 2) {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + minDaysAhead, hour, 0, 0),
  );
  start.setUTCDate(start.getUTCDate() + ((weekday - start.getUTCDay() + 7) % 7));
  return start;
}
const MINUTE = 60000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const BASE_START = nextWeekdayUtc(3, 9); // Wednesday 09:00
const WED_10 = new Date(BASE_START.getTime() + 60 * MINUTE); // Wed 10:00 (slots: 2 test)
const THU_09 = new Date(BASE_START.getTime() + DAY); // Thursday 09:00
const FRI_09 = new Date(BASE_START.getTime() + 2 * DAY); // Friday 09:00
const FRI_09_45 = new Date(FRI_09.getTime() + 45 * MINUTE); // Friday 09:45
const FRI_13 = new Date(FRI_09.getTime() + 4 * HOUR); // Friday 13:00
const MON_09 = new Date(BASE_START.getTime() + 5 * DAY); // Monday 09:00

describe('default appointment end-time (guards must never be skipped)', () => {
  let Tenant;
  let Branch;
  let Patient;
  let User;
  let Appointment;
  let tenantAId;
  let branchAId;
  let doctor;
  let otherDoctor;
  let patient;
  let otherPatient;
  let controller;
  let seq = 0;

  function nextUnique(prefix) {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
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
      name: 'Clinic Default End A',
      email: 'clinic-default-end-a@test.com',
      slug: 'clinic-default-end-a',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 1000 },
    });
    tenantAId = tenantA._id;

    const branchA = await Branch.create({
      tenant: tenantAId,
      name: 'Branch Default End',
      address: '2 Main St',
      phone: '+1000000002',
      slotDuration: 45,
    });
    branchAId = branchA._id;

    const weekday = { notWorking: false, open: '09:00', close: '17:00' };
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
      name: 'Doc Default End',
      email: nextUnique('doc') + '@test.com',
      password: 'hashed-not-used',
      roleId: new mongoose.Types.ObjectId(),
      isDoctor: true,
      workingHours,
      appointmentSettings: {},
    });
    otherDoctor = await User.create({
      tenant: tenantAId,
      branch: branchAId,
      name: 'Doc Default End B',
      email: nextUnique('docb') + '@test.com',
      password: 'hashed-not-used',
      roleId: new mongoose.Types.ObjectId(),
      isDoctor: true,
      workingHours,
      appointmentSettings: {},
    });

    patient = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'First',
      lastName: 'Default End',
      phone: nextUnique('+10'),
    });
    otherPatient = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'Second',
      lastName: 'Default End',
      phone: nextUnique('+11'),
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

  function createRequestBody({ chair, start = BASE_START, slots, doctorId = doctor._id, patientId = patient._id }) {
    const body = {
      doctor: String(doctorId),
      patient: String(patientId),
      chair,
      start,
    };
    if (slots != null) body.slots = slots;
    return body;
  }

  it('create with only a start resolves end = start + branch.slotDuration (×1 default)', async () => {
    const { res } = await run(
      controller.createAppointment,
      makeReq({ validatedBody: createRequestBody({ chair: 'Resolve Chair' }) }),
      makeRes(),
    );
    expect(res.statusCode).toBe(201);
    const saved = await Appointment.findById(res.body.data.appointment._id)
      .select('start end chair').lean();
    expect(saved.end.getTime()).toBe(saved.start.getTime() + 45 * 60000);
  });

  it('create with start + slots=x resolves end = start + slotDuration × x', async () => {
    const { res } = await run(
      controller.createAppointment,
      makeReq({ validatedBody: createRequestBody({ chair: 'Slots Chair', start: WED_10, slots: 2 }) }),
      makeRes(),
    );
    expect(res.statusCode).toBe(201);
    const saved = await Appointment.findById(res.body.data.appointment._id)
      .select('start end chair').lean();
    expect(saved.end.getTime()).toBe(saved.start.getTime() + 90 * 60000);
  });

  it('REG-RESSION: an end-less overlap still gets rejected (the old silent skip)', async () => {
    // First booking on chair X at 09:00, start only (end resolved by the
    // controller to 09:45) — doctor is otherwise free on this day.
    const first = await run(
      controller.createAppointment,
      makeReq({
        validatedBody: createRequestBody({
          chair: 'Endless Chair',
          start: THU_09,
        }),
      }),
      makeRes(),
    );
    expect(first.res.statusCode).toBe(201);

    // Second booking on the SAME chair at the SAME start but a different
    // doctor+patient. The old code left end=null → assertNoChairOverlap
    // returned early → this would have been a 201 double-book.
    let secondError = null;
    let secondRes = null;
    try {
      secondRes = await run(
        controller.createAppointment,
        makeReq({
          validatedBody: createRequestBody({
            chair: 'Endless Chair',
            start: THU_09,
            doctorId: otherDoctor._id,
            patientId: otherPatient._id,
          }),
        }),
        makeRes(),
      );
    } catch (err) {
      secondError = err;
    }
    expect(secondError).toBeDefined();
    expect(secondError.statusCode).toBe(409);
    expect(secondError.message).toMatch(/chair/);
  });

  it('create without a start is rejected with 400, not silently saved', async () => {
    let thrown = null;
    try {
      await run(
        controller.createAppointment,
        makeReq({
          validatedBody: {
            doctor: String(doctor._id),
            patient: String(patient._id),
            chair: 'No Start Chair',
            // no start, no end
          },
        }),
        makeRes(),
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown.statusCode).toBe(400);
    expect(thrown.message).toMatch(/start/);
  });

  it('update that moves only the start preserves the appointment length', async () => {
    const created = await Appointment.create({
      tenant: tenantAId,
      branch: branchAId,
      patient: patient._id,
      doctor: doctor._id,
      chair: 'Length Chair',
      start: FRI_09,
      end: FRI_09_45,
      status: 'scheduled',
    });

    const { res } = await run(
      controller.updateAppointment,
      makeReq({
        params: { id: String(created._id) },
        validatedBody: { start: FRI_13.toISOString() },
      }),
      makeRes(),
    );
    expect(res.statusCode).toBe(200);
    const saved = await Appointment.findById(created._id).select('start end').lean();
    expect(saved.start.toISOString()).toBe(FRI_13.toISOString());
    expect(saved.end.toISOString()).toBe(new Date(FRI_13.getTime() + 45 * MINUTE).toISOString());
  });

  it('update of a legacy end-less row heals it: end resolved and persisted', async () => {
    // A row created directly against the model — the schema does not require
    // end — mimicking pre-fix data that never got a resolved end time.
    const legacy = await Appointment.create({
      tenant: tenantAId,
      branch: branchAId,
      patient: patient._id,
      doctor: doctor._id,
      chair: 'Legacy Chair',
      start: MON_09,
      status: 'scheduled',
    });
    expect(legacy.end).toBeUndefined();

    const { res } = await run(
      controller.updateAppointment,
      makeReq({
        params: { id: String(legacy._id) },
        validatedBody: { chair: 'Legacy Chair Renamed' },
      }),
      makeRes(),
    );
    expect(res.statusCode).toBe(200);
    const saved = await Appointment.findById(legacy._id).select('start end chair').lean();
    expect(saved.chair).toBe('Legacy Chair Renamed');
    expect(saved.end).toBeInstanceOf(Date);
    expect(saved.end.getTime()).toBe(saved.start.getTime() + 45 * 60000);
  });
});