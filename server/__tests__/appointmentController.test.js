import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
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
vi.mock('../services/eventBus.js', () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/queueNotificationService.js', () => ({
  notifyQueueJoined: vi.fn().mockResolvedValue(undefined),
  notifyTurnNow: vi.fn().mockResolvedValue(undefined),
  notifyVisitCompleted: vi.fn().mockResolvedValue(undefined),
}));

import { publishEvent } from '../services/eventBus.js';
import { emitToBranch, emitToTenantQueue } from '../socket/index.js';
import { notifyQueueJoined, notifyTurnNow, notifyVisitCompleted } from '../services/queueNotificationService.js';
import * as controller from '../modules/appointments/appointment.controller.js';
import Appointment from '../modules/appointments/appointment.model.js';
import Patient from '../modules/patients/patient.model.js';
import User from '../modules/users/user.model.js';
import Branch from '../modules/users/branch.model.js';
import Tenant from '../modules/site/tenant/tenant.model.js';
import DoctorAvailability from '../modules/users/doctorAvailability.model.js';

const DB = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';

function weekdayAt(daysFromNow, hour = 10, minute = 0) {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

const weekday = { open: '09:00', close: '17:00', notWorking: false };
const workingHours = {
  sunday: { notWorking: true },
  monday: weekday, tuesday: weekday, wednesday: weekday,
  thursday: weekday, friday: weekday,
  saturday: { notWorking: true },
};

let tenantAId, branchAId, doctorId, patientId, patientId2;
let doctor2Id, patientOtherBranchId;
let branchOtherId;

describe('Appointment controller handlers', () => {
  beforeAll(async () => {
    await mongoose.connect(DB);
    await Promise.all([
      Appointment.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
      Branch.deleteMany({}),
      Tenant.deleteMany({}),
      DoctorAvailability.deleteMany({}),
    ]);

    const tenant = await Tenant.create({
      name: 'Clinic Ctrl', email: 'ctrl@test.com', slug: 'clinic-ctrl',
      plan: 'professional', status: 'active', isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 1000 },
      timezone: 'UTC',
    });
    tenantAId = tenant._id;

    const branch = await Branch.create({
      tenant: tenantAId, name: 'Main', address: '1 Main St', phone: '+1000000001',
      slotDuration: 30,
    });
    branchAId = branch._id;

    const branchOther = await Branch.create({
      tenant: tenantAId, name: 'Other', address: '2 Other St',
    });
    branchOtherId = branchOther._id;

    doctorId = (await User.create({
      tenant: tenantAId, branch: branchAId, name: 'Dr. One', email: `drone-${Date.now()}@test.com`,
      password: 'hashed', roleId: new mongoose.Types.ObjectId(), isDoctor: true, workingHours,
    }))._id;

    doctor2Id = (await User.create({
      tenant: tenantAId, branch: branchAId, name: 'Dr. Two', email: `drtwo-${Date.now()}@test.com`,
      password: 'hashed', roleId: new mongoose.Types.ObjectId(), isDoctor: true, workingHours,
    }))._id;

    patientId = (await Patient.create({
      tenant: tenantAId, branch: branchAId, firstName: 'John', lastName: 'Doe', phone: '+1234567890',
    }))._id;

    patientId2 = (await Patient.create({
      tenant: tenantAId, branch: branchAId, firstName: 'Jane', lastName: 'Roe', phone: '+1234567891',
    }))._id;

    patientOtherBranchId = (await Patient.create({
      tenant: tenantAId, branch: branchOtherId, firstName: 'Other', lastName: 'P', phone: '+9999999999',
    }))._id;

    await Appointment.init();
  }, 60000);

  afterAll(async () => {
    await Promise.all([
      Appointment.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
      Branch.deleteMany({}),
      Tenant.deleteMany({}),
      DoctorAvailability.deleteMany({}),
    ]);
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Appointment.deleteMany({});
    await DoctorAvailability.deleteMany({});
    vi.clearAllMocks();
  });

  function makeRes() {
    const res = { statusCode: null, body: null, locals: {} };
    res.status = function (code) { this.statusCode = code; return this; };
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

  async function run(fn, req, res) {
    const next = vi.fn();
    await fn(req, res, next);
    if (next.mock.calls.length) throw next.mock.calls[0][0];
    return { res, next };
  }

  function expectRejected(fn, pattern, statusCode) {
    return expect(fn()).rejects.toMatchObject({ statusCode, message: expect.stringMatching(pattern) });
  }

  async function createAppointmentAt(doctorOid, patientOid, start, extra = {}) {
    const { res } = await run(controller.createAppointment, makeReq({
      validatedBody: { doctor: String(doctorOid), patient: String(patientOid), start, ...extra },
    }), makeRes());
    expect(res.statusCode).toBe(201);
    return res.body.data.appointment;
  }

  // --- listAppointments ---

  describe('listAppointments', () => {
    it('lists appointments filtered by doctor and date range', async () => {
      const start = weekdayAt(2, 10);
      const end = new Date(start.getTime() + 30 * 60000);
      await createAppointmentAt(doctorId, patientId, start);

      const { res } = await run(controller.listAppointments, makeReq({
        validatedQuery: { page: 1, limit: 20, doctor: String(doctorId), from: new Date(start.getTime() - 3600000).toISOString(), to: end.toISOString() },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointments.length).toBe(1);
      expect(res.body.data.pagination.total).toBe(1);
      expect(String(res.body.data.appointments[0].doctor._id)).toBe(String(doctorId));
    });

    it('filters patient by text search term', async () => {
      const start1 = weekdayAt(3, 10);
      const start2 = weekdayAt(4, 10);
      await createAppointmentAt(doctorId, patientId, start1);
      await createAppointmentAt(doctor2Id, patientId2, start2);

      const { res } = await run(controller.listAppointments, makeReq({
        validatedQuery: { page: 1, limit: 20, patient: 'John' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointments.length).toBe(1);
    });

    it('filters patient by ObjectId', async () => {
      const start = weekdayAt(5, 10);
      await createAppointmentAt(doctorId, patientId, start);

      const { res } = await run(controller.listAppointments, makeReq({
        validatedQuery: { page: 1, limit: 20, patient: String(patientId) },
      }), makeRes());
      expect(res.body.data.appointments.length).toBe(1);
    });

    it('filters by status', async () => {
      const s1 = weekdayAt(2, 11);
      const s2 = weekdayAt(3, 11);
      await createAppointmentAt(doctorId, patientId, s1);
      await createAppointmentAt(doctor2Id, patientId2, s2);

      const { res } = await run(controller.listAppointments, makeReq({
        validatedQuery: { page: 1, limit: 20, status: 'scheduled' },
      }), makeRes());
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('masks PHI on impersonation sessions', async () => {
      const start = weekdayAt(2, 12);
      await createAppointmentAt(doctorId, patientId, start);

      const { res } = await run(controller.listAppointments, makeReq({
        isImpersonation: true,
        validatedQuery: { page: 1, limit: 20 },
      }), makeRes());
      const appt = res.body.data.appointments[0];
      expect(appt.patient.phone).toBeUndefined();
    });
  });

  // --- getAppointment ---

  describe('getAppointment', () => {
    it('returns 400 for invalid id', async () => {
      await expectRejected(
        () => run(controller.getAppointment, makeReq({ params: { id: 'bad' } }), makeRes()),
        /Invalid appointment id/, 400,
      );
    });

    it('returns 404 when not found', async () => {
      await expectRejected(
        () => run(controller.getAppointment, makeReq({ params: { id: new mongoose.Types.ObjectId().toString() } }), makeRes()),
        /not found/i, 404,
      );
    });

    it('returns the appointment on success', async () => {
      const start = weekdayAt(2, 10);
      const created = await createAppointmentAt(doctorId, patientId, start);

      const { res } = await run(controller.getAppointment, makeReq({ params: { id: created._id } }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(String(res.body.data.appointment._id)).toBe(String(created._id));
    });
  });

  // --- createAppointment ---

  describe('createAppointment', () => {
    it('requires start time', async () => {
      await expectRejected(
        () => run(controller.createAppointment, makeReq({ validatedBody: { doctor: String(doctorId), patient: String(patientId) } }), makeRes()),
        /start time is required/i, 400,
      );
    });

    it('defaults end to slotDuration * slots', async () => {
      const start = weekdayAt(2, 10);
      const { res } = await run(controller.createAppointment, makeReq({
        validatedBody: { doctor: String(doctorId), patient: String(patientId), start },
      }), makeRes());
      expect(res.statusCode).toBe(201);
      const a = res.body.data.appointment;
      const diffMin = (new Date(a.end) - new Date(a.start)) / 60000;
      expect(diffMin).toBe(30);
    });

    it('respects slots multiplier', async () => {
      const start = weekdayAt(3, 10);
      const { res } = await run(controller.createAppointment, makeReq({
        validatedBody: { doctor: String(doctorId), patient: String(patientId), start, slots: 2 },
      }), makeRes());
      const a = res.body.data.appointment;
      expect((new Date(a.end) - new Date(a.start)) / 60000).toBe(60);
    });

    it('rejects when referenced patient not in branch', async () => {
      const start = weekdayAt(4, 10);
      await expectRejected(
        () => run(controller.createAppointment, makeReq({
          validatedBody: { doctor: String(doctorId), patient: String(patientOtherBranchId), start },
        }), makeRes()),
        /patient.*not found|does not exist/i, 400,
      );
    });

    it('rejects when doctor is not a doctor', async () => {
      const start = weekdayAt(5, 10);
      await expectRejected(
        () => run(controller.createAppointment, makeReq({
          validatedBody: { doctor: String(patientId), patient: String(patientId2), start },
        }), makeRes()),
        /doctor.*not found|not a doctor/i, 400,
      );
    });

    it('rejects when doctor has availability exception', async () => {
      const start = weekdayAt(2, 10);
      const end = new Date(start.getTime() + 30 * 60000);
      await DoctorAvailability.create({
        tenant: tenantAId, doctor: doctorId, branch: branchAId, type: 'time_off',
        start, end, reason: 'Holiday',
      });
      await expectRejected(
        () => run(controller.createAppointment, makeReq({
          validatedBody: { doctor: String(doctorId), patient: String(patientId), start },
        }), makeRes()),
        /unavailable/i, 409,
      );
    });

    it('rejects when doctor is double-booked', async () => {
      const start = weekdayAt(2, 10);
      await createAppointmentAt(doctorId, patientId, start);
      await expectRejected(
        () => run(controller.createAppointment, makeReq({
          validatedBody: { doctor: String(doctorId), patient: String(patientId2), start },
        }), makeRes()),
        /overlapping|already has an appointment/i, 409,
      );
    });

    it('rejects when chair is double-booked', async () => {
      const start = weekdayAt(3, 10);
      await createAppointmentAt(doctorId, patientId, start, { chair: 'Chair 1' });
      await expectRejected(
        () => run(controller.createAppointment, makeReq({
          validatedBody: { doctor: String(doctor2Id), patient: String(patientId2), start, chair: 'Chair 1' },
        }), makeRes()),
        /chair.*already booked/i, 409,
      );
    });

    it('rejects outside clinic working hours', async () => {
      const start = weekdayAt(2, 18);
      const end = new Date(start.getTime() + 30 * 60000);
      await expectRejected(
        () => run(controller.createAppointment, makeReq({
          validatedBody: { doctor: String(doctorId), patient: String(patientId), start, end },
        }), makeRes()),
        /working hours|outside/i, 400,
      );
    });

    it('publishes appointment.created event and calls notifyQueueJoined', async () => {
      const start = weekdayAt(2, 10);
      const { res } = await run(controller.createAppointment, makeReq({
        validatedBody: { doctor: String(doctorId), patient: String(patientId), start },
      }), makeRes());
      expect(res.statusCode).toBe(201);
      expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'appointment.created' }));
      expect(notifyQueueJoined).toHaveBeenCalled();
    });

    it('emits appointment:created to branch', async () => {
      const start = weekdayAt(2, 10);
      await run(controller.createAppointment, makeReq({
        validatedBody: { doctor: String(doctorId), patient: String(patientId), start },
      }), makeRes());
      expect(emitToBranch).toHaveBeenCalledWith(expect.anything(), 'appointment:created', expect.anything());
    });

    it('stores status from body when provided', async () => {
      const start = weekdayAt(2, 10);
      const { res } = await run(controller.createAppointment, makeReq({
        validatedBody: { doctor: String(doctorId), patient: String(patientId), start, status: 'confirmed' },
      }), makeRes());
      expect(res.body.data.appointment.status).toBe('confirmed');
    });

    it('sets createdBy from req.user._id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const start = weekdayAt(2, 10);
      const { res } = await run(controller.createAppointment, makeReq({
        user: { _id: userId, tenant: tenantAId, branch: branchAId },
        validatedBody: { doctor: String(doctorId), patient: String(patientId), start },
      }), makeRes());
      expect(String(res.body.data.appointment.createdBy)).toBe(userId.toString());
    });
  });

  // --- updateAppointment ---

  describe('updateAppointment', () => {
    it('returns 400 for invalid id', async () => {
      await expectRejected(
        () => run(controller.updateAppointment, makeReq({ params: { id: 'bad' }, validatedBody: { reason: 'x' } }), makeRes()),
        /Invalid appointment id/, 400,
      );
    });

    it('returns 404 when not found', async () => {
      await expectRejected(
        () => run(controller.updateAppointment, makeReq({ params: { id: new mongoose.Types.ObjectId().toString() }, validatedBody: { reason: 'x' } }), makeRes()),
        /not found/i, 404,
      );
    });

    it('rejects end <= start', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await expectRejected(
        () => run(controller.updateAppointment, makeReq({
          params: { id: appt._id },
          validatedBody: { start: start.toISOString(), end: new Date(start.getTime() - 1000).toISOString() },
        }), makeRes()),
        /end time must be after start/i, 400,
      );
    });

    it('reschedules to a new time preserving duration', async () => {
      const originalStart = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, originalStart);
      const originalDuration = new Date(appt.end) - new Date(appt.start);

      const newStart = weekdayAt(3, 11);
      const { res } = await run(controller.updateAppointment, makeReq({
        params: { id: appt._id },
        validatedBody: { start: newStart.toISOString() },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      const updated = res.body.data.appointment;
      expect(new Date(updated.start).getTime()).toBe(newStart.getTime());
      const newDuration = new Date(updated.end) - new Date(updated.start);
      expect(newDuration).toBe(originalDuration);
    });

    it('skips availability checks when only notes/reason change', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      const { res } = await run(controller.updateAppointment, makeReq({
        params: { id: appt._id },
        validatedBody: { reason: 'Updated reason', notes: 'Updated notes' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointment.reason).toBe('Updated reason');
    });

    it('rejects update to doctor who is not a doctor', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await expectRejected(
        () => run(controller.updateAppointment, makeReq({
          params: { id: appt._id },
          validatedBody: { doctor: String(patientId) },
        }), makeRes()),
        /doctor.*not found|not a doctor/i, 400,
      );
    });

    it('emits appointment:updated on success', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await run(controller.updateAppointment, makeReq({
        params: { id: appt._id },
        validatedBody: { reason: 'Changed' },
      }), makeRes());
      expect(emitToBranch).toHaveBeenCalledWith(expect.anything(), 'appointment:updated', expect.anything());
    });
  });

  // --- transitionAppointment ---

  describe('transitionAppointment', () => {
    it('returns 400 for invalid id', async () => {
      await expectRejected(
        () => run(controller.transitionAppointment, makeReq({ params: { id: 'bad' }, validatedBody: { status: 'confirmed' } }), makeRes()),
        /Invalid appointment id/, 400,
      );
    });

    it('returns 404 when not found', async () => {
      await expectRejected(
        () => run(controller.transitionAppointment, makeReq({ params: { id: new mongoose.Types.ObjectId().toString() }, validatedBody: { status: 'confirmed' } }), makeRes()),
        /not found/i, 404,
      );
    });

    it('returns early with same status (no event)', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      vi.clearAllMocks();
      const { res } = await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'scheduled' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it('rejects illegal transition scheduled → completed', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await expectRejected(
        () => run(controller.transitionAppointment, makeReq({
          params: { id: appt._id }, validatedBody: { status: 'completed' },
        }), makeRes()),
        /cannot transition/i, 409,
      );
    });

    it('transitions scheduled → confirmed and publishes event', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      vi.clearAllMocks();
      const { res } = await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'confirmed' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointment.status).toBe('confirmed');
      expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'appointment.confirmed' }));
    });

    it('transitions to checked_in with no late flag', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      vi.clearAllMocks();
      const { res } = await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'checked_in' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointment.checkedInAt).toBeDefined();
      expect(emitToBranch).toHaveBeenCalledWith(expect.anything(), 'queue.status.changed', expect.anything());
    });

    it('transitions to checked_in with late arrival flag', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(start.getTime() + 25 * 60000));
      vi.clearAllMocks();
      const { res } = await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'checked_in' },
      }), makeRes());
      vi.useRealTimers();
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointment.lateArrival.flagged).toBe(true);
      expect(res.body.data.appointment.lateArrival.minutesLate).toBe(25);
      expect(emitToBranch).toHaveBeenCalledWith(expect.anything(), 'appointment.lateArrival', expect.anything());
    });

    it('transitions checked_in → in_progress and calls notifyTurnNow', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'checked_in' },
      }), makeRes());
      vi.clearAllMocks();
      const { res } = await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'in_progress' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(notifyTurnNow).toHaveBeenCalled();
    });

    it('transitions in_progress → completed and calls notifyVisitCompleted', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'checked_in' },
      }), makeRes());
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'in_progress' },
      }), makeRes());
      vi.clearAllMocks();
      const { res } = await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'completed' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'appointment.completed' }));
      expect(notifyVisitCompleted).toHaveBeenCalled();
      expect(emitToBranch).toHaveBeenCalledWith(expect.anything(), 'queue.status.changed', expect.anything());
    });

    it('transitions scheduled → no_show and publishes event', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      vi.clearAllMocks();
      const { res } = await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'no_show' },
      }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'appointment.no_show' }));
    });
  });

  // --- cancelAppointment ---

  describe('cancelAppointment', () => {
    it('returns 400 for invalid id', async () => {
      await expectRejected(
        () => run(controller.cancelAppointment, makeReq({ params: { id: 'bad' } }), makeRes()),
        /Invalid appointment id/, 400,
      );
    });

    it('returns 404 when not found', async () => {
      await expectRejected(
        () => run(controller.cancelAppointment, makeReq({ params: { id: new mongoose.Types.ObjectId().toString() } }), makeRes()),
        /not found/i, 404,
      );
    });

    it('returns early with 200 when already cancelled', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'cancelled' },
      }), makeRes());
      vi.clearAllMocks();
      const { res } = await run(controller.cancelAppointment, makeReq({ params: { id: appt._id } }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it('rejects cancel for completed appointment', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'checked_in' },
      }), makeRes());
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'in_progress' },
      }), makeRes());
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'completed' },
      }), makeRes());
      await expectRejected(
        () => run(controller.cancelAppointment, makeReq({ params: { id: appt._id } }), makeRes()),
        /cannot cancel/i, 409,
      );
    });

    it('cancels a scheduled appointment and emits events', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      vi.clearAllMocks();
      const { res } = await run(controller.cancelAppointment, makeReq({ params: { id: appt._id } }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointment.status).toBe('cancelled');
      expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'appointment.cancelled' }));
      expect(emitToBranch).toHaveBeenCalledWith(expect.anything(), 'appointment:statusChanged', expect.anything());
    });

    it('cancels a checked_in appointment', async () => {
      const start = weekdayAt(2, 10);
      const appt = await createAppointmentAt(doctorId, patientId, start);
      await run(controller.transitionAppointment, makeReq({
        params: { id: appt._id }, validatedBody: { status: 'checked_in' },
      }), makeRes());
      vi.clearAllMocks();
      const { res } = await run(controller.cancelAppointment, makeReq({ params: { id: appt._id } }), makeRes());
      expect(res.statusCode).toBe(200);
      expect(res.body.data.appointment.status).toBe('cancelled');
    });
  });
});
