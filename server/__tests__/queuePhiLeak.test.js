/**
 * Regression tests for the PHI leak on live-queue socket events.
 *
 * The appointment controller's POPULATE includes the patient's `phone`, and
 * `emitQueueStatusChange` broadcast the fully populated appointment to the
 * branch and tenant live-queue rooms. Those rooms are broadcast channels read
 * by any workstation (and the waiting-room board), so identifiable patient
 * data must never be emitted.
 *
 * Fix under test: queue status events are stripped of PHI before they go out;
 * identification fields the board needs (name) stay.
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

import { emitToBranch, emitToTenantQueue } from '../socket/index.js';

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

const DB = 'mongodb://127.0.0.1:27017/dental_os_queue_phi_test';

describe('live-queue socket events never carry PHI', () => {
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
      name: 'Clinic Phi A',
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
      name: 'Branch Phi',
      address: '3 Main St',
      phone: '+1000000003',
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
      name: 'Doc Phi',
      email: nextUnique('doc') + '@test.com',
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
      lastName: 'Phi',
      phone: '+15555550101',
      email: 'phi-patient@test.com',
      dateOfBirth: new Date(Date.UTC(1980, 4, 12)),
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

  async function bookAppointment(chair, hour) {
    const { res } = await run(
      controller.createAppointment,
      makeReq({
        validatedBody: {
          doctor: String(doctor._id),
          patient: String(patient._id),
          chair,
          start: new Date(Date.UTC(2026, 8, 22, hour, 0, 0)),
          end: new Date(Date.UTC(2026, 8, 22, hour, 30, 0)),
        },
      }),
      makeRes(),
    );
    expect(res.statusCode).toBe(201);
    return res.body.data.appointment;
  }

  function lastQueuePayload() {
    const branchCalls = emitToBranch.mock.calls.filter((c) => c[1] === 'queue.status.changed');
    expect(branchCalls.length).toBeGreaterThanOrEqual(1);
    return branchCalls[branchCalls.length - 1][2].appointment;
  }

  it('a queue status change emits an appointment without the patient phone', async () => {
    emitToBranch.mockClear();
    emitToTenantQueue.mockClear();

    const created = await bookAppointment('Phi Chair 1', 9);
    await run(
      controller.transitionAppointment,
      makeReq({ params: { id: created._id }, validatedBody: { status: 'checked_in' } }),
      makeRes(),
    );

    const payload = lastQueuePayload();
    // PHI deleted…
    expect(payload.patient.phone).toBeUndefined();
    expect(payload.patient.email).toBeUndefined();
    expect(payload.patient.dateOfBirth).toBeUndefined();
    // …identification the waiting-room board needs stays.
    expect(payload.patient.firstName).toBe('First');
    expect(payload.patient.lastName).toBe('Phi');

    // The tenant queue room got the same safe payload.
    const tenantCalls = emitToTenantQueue.mock.calls.filter((c) => c[1] === 'queue.status.changed');
    expect(tenantCalls.length).toBeGreaterThanOrEqual(1);
    const tenantPayload = tenantCalls[tenantCalls.length - 1][2].appointment;
    expect(tenantPayload.patient.phone).toBeUndefined();
    expect(tenantPayload.patient.firstName).toBe('First');
  });

  it('the delivered event still carries the appointment facts the board needs', async () => {
    emitToBranch.mockClear();

    const created = await bookAppointment('Phi Chair 2', 10);
    const { res } = await run(
      controller.transitionAppointment,
      makeReq({ params: { id: created._id }, validatedBody: { status: 'checked_in' } }),
      makeRes(),
    );
    expect(res.statusCode).toBe(200);

    const payload = lastQueuePayload();
    expect(String(payload._id)).toBe(String(created._id));
    expect(payload.status).toBe('checked_in');
    expect(payload.chair).toBe('Phi Chair 2');
    expect(payload.start).toBeDefined();
    expect(payload.end).toBeDefined();
    expect(payload.doctor).toBeDefined();
  });

  it('a cancel that mirrors onto the queue also strips PHI', async () => {
    emitToBranch.mockClear();

    const created = await bookAppointment('Phi Chair 3', 11);
    const { res } = await run(
      controller.cancelAppointment,
      makeReq({ params: { id: created._id } }),
      makeRes(),
    );
    expect(res.statusCode).toBe(200);

    const branchCalls = emitToBranch.mock.calls;
    const relevant = branchCalls.filter((c) => c[2]?.appointment);
    expect(relevant.length).toBeGreaterThanOrEqual(1);
    for (const [, , payloadObj] of relevant) {
      const patientPart = payloadObj.appointment.patient;
      if (patientPart && typeof patientPart === 'object') {
        expect(patientPart.phone).toBeUndefined();
        expect(patientPart.email).toBeUndefined();
      }
    }
  });

  describe("queue.controller live board and call-next", () => {
    let qc;
    let todayRange;
    let doctor2;
    let patient2;
    let aptChecked1;
    let aptChecked2;
    let aptInProgress;
    let aptCompleted;

    beforeAll(async () => {
      qc = await import("../modules/appointments/queue.controller.js");
      const { zonedTodayRangeUtc } = await import("../utils/zonedDates.js");
      todayRange = zonedTodayRangeUtc(Date.now(), "UTC");

      doctor2 = await User.create({
        tenant: tenantAId,
        branch: branchAId,
        name: "Doc Queue Two",
        email: `doc-queue-2-${Date.now()}@test.com`,
        password: "hashed-not-used",
        roleId: new mongoose.Types.ObjectId(),
        isDoctor: true,
        workingHours: {
          sunday: { notWorking: true },
          monday: { notWorking: false, open: "09:00", close: "17:00" },
          tuesday: { notWorking: false, open: "09:00", close: "17:00" },
          wednesday: { notWorking: false, open: "09:00", close: "17:00" },
          thursday: { notWorking: false, open: "09:00", close: "17:00" },
          friday: { notWorking: false, open: "09:00", close: "17:00" },
          saturday: { notWorking: true },
        },
        appointmentSettings: {},
      });

      patient2 = await Patient.create({
        tenant: tenantAId,
        branch: branchAId,
        firstName: "Second",
        lastName: "Queue",
        phone: "+15555550202",
        email: "queue-patient2@test.com",
        dateOfBirth: new Date(Date.UTC(1990, 0, 1)),
      });

      const t0 = todayRange.start.getTime();

      aptChecked1 = await Appointment.create({
        tenant: tenantAId,
        branch: branchAId,
        doctor: doctor._id,
        patient: patient._id,
        chair: "Q-Chair-DoctorA",
        start: new Date(t0 + 13 * 3600000),
        end: new Date(t0 + 13.5 * 3600000),
        status: "checked_in",
      });

      aptChecked2 = await Appointment.create({
        tenant: tenantAId,
        branch: branchAId,
        doctor: doctor2._id,
        patient: patient2._id,
        chair: "Q-Chair-DoctorB",
        start: new Date(t0 + 13.5 * 3600000),
        end: new Date(t0 + 14 * 3600000),
        status: "checked_in",
      });

      aptInProgress = await Appointment.create({
        tenant: tenantAId,
        branch: branchAId,
        doctor: doctor._id,
        patient: patient._id,
        chair: "Q-Chair-InProgress",
        start: new Date(t0 + 14 * 3600000),
        end: new Date(t0 + 14.5 * 3600000),
        status: "in_progress",
      });

      aptCompleted = await Appointment.create({
        tenant: tenantAId,
        branch: branchAId,
        doctor: doctor._id,
        patient: patient._id,
        chair: "Q-Chair-Done",
        start: new Date(t0 + 15 * 3600000),
        end: new Date(t0 + 15.5 * 3600000),
        status: "completed",
      });
    });

    it("getQueue partitions appointments into waiting, inChair, and completedToday", async () => {
      const res = makeRes();
      await run(qc.getQueue, makeReq(), res);
      expect(res.body.success).toBe(true);
      const { queue } = res.body.data;
      expect(queue.waiting.map((a) => String(a._id))).toContain(String(aptChecked1._id));
      expect(queue.waiting.map((a) => String(a._id))).toContain(String(aptChecked2._id));
      expect(queue.inChair.map((a) => String(a._id))).toContain(String(aptInProgress._id));
      expect(queue.completedToday).toBeGreaterThanOrEqual(1);
      expect(queue.updatedAt).toBeDefined();
    });

    it("getQueue strips PHI under impersonation", async () => {
      const res = makeRes();
      await run(qc.getQueue, makeReq({ isImpersonation: true }), res);
      const entry = res.body.data.queue.waiting.find(
        (a) => String(a._id) === String(aptChecked1._id),
      );
      expect(entry).toBeDefined();
      expect(entry.patient.phone).toBeUndefined();
      expect(entry.patient.email).toBeUndefined();
    });

    it("callNextPatient moves the selected doctor patient to in_progress and emits", async () => {
      emitToBranch.mockClear();
      emitToTenantQueue.mockClear();

      const res = makeRes();
      await run(
        qc.callNextPatient,
        makeReq({ validatedBody: { doctor: String(doctor2._id) } }),
        res,
      );

      expect(res.body.success).toBe(true);
      const apt = res.body.data.appointment;
      expect(String(apt._id)).toBe(String(aptChecked2._id));
      expect(apt.status).toBe("in_progress");
      expect(apt.patient.firstName).toBe("Second");
      expect(apt.doctor.name).toBe("Doc Queue Two");

      expect(emitToBranch).toHaveBeenCalledWith(
        expect.any(String),
        "queue.patient.called",
        expect.objectContaining({
          appointment: expect.objectContaining({ status: "in_progress" }),
        }),
      );
      expect(emitToTenantQueue).toHaveBeenCalledWith(
        expect.anything(),
        "queue.patient.called",
        expect.anything(),
      );
    });

    it("callNextPatient throws 404 when no patients match the doctor filter", async () => {
      const fakeDoctorId = new mongoose.Types.ObjectId();
      await expect(
        run(
          qc.callNextPatient,
          makeReq({ validatedBody: { doctor: String(fakeDoctorId) } }),
          makeRes(),
        ),
      ).rejects.toThrow(/No waiting patients/);
    });
  });
});