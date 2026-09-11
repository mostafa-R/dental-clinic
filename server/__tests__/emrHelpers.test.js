import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { assertAppointmentsForPatient, ensureNextAppointment } from '../utils/emrHelpers.js';
import Appointment from '../modules/appointments/appointment.model.js';
import ApiError from '../utils/ApiError.js';

const DB = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';

let tenantId, branchId, patientId, doctorId;

beforeAll(async () => {
  await mongoose.connect(DB);
  await Appointment.init();
  tenantId = new mongoose.Types.ObjectId();
  branchId = new mongoose.Types.ObjectId();
  patientId = new mongoose.Types.ObjectId();
  doctorId = new mongoose.Types.ObjectId();
});

afterAll(async () => {
  await Appointment.deleteMany({});
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Appointment.deleteMany({});
});

function futureWeekdayAt(hoursFromNow = 48, hour = 10) {
  const d = new Date(Date.now() + hoursFromNow * 3600000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

describe('assertAppointmentsForPatient', () => {
  it('resolves immediately when refs is null/undefined/empty', async () => {
    await expect(assertAppointmentsForPatient(null, { patient: patientId, branch: branchId })).resolves.toBeUndefined();
    await expect(assertAppointmentsForPatient(undefined, { patient: patientId, branch: branchId })).resolves.toBeUndefined();
    await expect(assertAppointmentsForPatient([], { patient: patientId, branch: branchId })).resolves.toBeUndefined();
  });

  it('resolves when all appointment refs belong to the patient+branch', async () => {
    const appt = await Appointment.create({
      patient: patientId, doctor: doctorId, branch: branchId, tenant: tenantId,
      start: new Date(), end: new Date(Date.now() + 30 * 60000), status: 'scheduled',
    });
    await expect(assertAppointmentsForPatient(String(appt._id), { patient: patientId, branch: branchId })).resolves.toBeUndefined();
  });

  it('resolves for an array of valid refs', async () => {
    const a1 = await Appointment.create({
      patient: patientId, doctor: doctorId, branch: branchId, tenant: tenantId,
      start: new Date(), end: new Date(Date.now() + 30 * 60000), status: 'scheduled',
    });
    const a2 = await Appointment.create({
      patient: patientId, doctor: doctorId, branch: branchId, tenant: tenantId,
      start: new Date(Date.now() + 3600000), end: new Date(Date.now() + 3900000), status: 'scheduled',
    });
    await expect(assertAppointmentsForPatient([String(a1._id), String(a2._id)], { patient: patientId, branch: branchId })).resolves.toBeUndefined();
  });

  it('rejects when appointment belongs to a different patient', async () => {
    const otherPatient = new mongoose.Types.ObjectId();
    const appt = await Appointment.create({
      patient: otherPatient, doctor: doctorId, branch: branchId, tenant: tenantId,
      start: new Date(), end: new Date(Date.now() + 30 * 60000), status: 'scheduled',
    });
    await expect(
      assertAppointmentsForPatient(String(appt._id), { patient: patientId, branch: branchId }),
    ).rejects.toMatchObject({ statusCode: 400, message: /do not belong to this patient/ });
  });

  it('rejects when one id in the array is invalid', async () => {
    const appt = await Appointment.create({
      patient: patientId, doctor: doctorId, branch: branchId, tenant: tenantId,
      start: new Date(), end: new Date(Date.now() + 30 * 60000), status: 'scheduled',
    });
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      assertAppointmentsForPatient([String(appt._id), fakeId], { patient: patientId, branch: branchId }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('ensureNextAppointment', () => {
  it('returns null when nextAppointment is null', async () => {
    const result = await ensureNextAppointment({ nextAppointment: null, patient: patientId, branch: branchId, tenant: tenantId, doctor: doctorId, createdBy: doctorId });
    expect(result).toBeNull();
  });

  it('returns null when nextAppointment is in the past', async () => {
    const past = new Date(Date.now() - 86400000);
    const result = await ensureNextAppointment({ nextAppointment: past, patient: patientId, branch: branchId, tenant: tenantId, doctor: doctorId, createdBy: doctorId });
    expect(result).toBeNull();
  });

  it('returns existing id when exact duplicate exists', async () => {
    const start = futureWeekdayAt(48, 10);
    const end = new Date(start.getTime() + 30 * 60000);
    const existing = await Appointment.create({
      patient: patientId, doctor: doctorId, branch: branchId, tenant: tenantId,
      start, end, status: 'scheduled', reason: 'Follow-up visit', createdBy: doctorId,
    });
    const result = await ensureNextAppointment({
      nextAppointment: start, patient: patientId, branch: branchId, tenant: tenantId, doctor: doctorId, createdBy: doctorId,
    });
    expect(String(result)).toBe(String(existing._id));
    const count = await Appointment.countDocuments({ patient: patientId, branch: branchId, status: { $ne: 'cancelled' } });
    expect(count).toBe(1);
  });

  it('throws conflict when doctor has overlapping appointment', async () => {
    const start = futureWeekdayAt(48, 10);
    const end = new Date(start.getTime() + 30 * 60000);
    await Appointment.create({
      patient: patientId, doctor: doctorId, branch: branchId, tenant: tenantId,
      start, end, status: 'scheduled', createdBy: doctorId,
    });
    const overlappingStart = new Date(start.getTime() + 15 * 60000);
    await expect(
      ensureNextAppointment({
        nextAppointment: overlappingStart, patient: patientId, branch: branchId, tenant: tenantId, doctor: doctorId, createdBy: doctorId,
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: /overlapping/ });
  });

  it('creates a follow-up appointment with default 30-min duration', async () => {
    const start = futureWeekdayAt(72, 11);
    const result = await ensureNextAppointment({
      nextAppointment: start, nextAppointmentNotes: 'Check-up notes', patient: patientId, branch: branchId, tenant: tenantId, doctor: doctorId, createdBy: doctorId,
    });
    expect(result).toBeDefined();
    const created = await Appointment.findById(result).lean();
    expect(created.start.getTime()).toBe(start.getTime());
    expect(created.end.getTime()).toBe(start.getTime() + 30 * 60000);
    expect(created.status).toBe('scheduled');
    expect(created.reason).toBe('Check-up notes');
    expect(String(created.patient)).toBe(String(patientId));
    expect(String(created.doctor)).toBe(String(doctorId));
    expect(String(created.branch)).toBe(String(branchId));
    expect(String(created.tenant)).toBe(String(tenantId));
    expect(String(created.createdBy)).toBe(String(doctorId));
  });

  it('truncates reason to 300 chars from nextAppointmentNotes', async () => {
    const start = futureWeekdayAt(96, 14);
    const longNotes = 'x'.repeat(500);
    const result = await ensureNextAppointment({
      nextAppointment: start, nextAppointmentNotes: longNotes, patient: patientId, branch: branchId, tenant: tenantId, doctor: doctorId, createdBy: doctorId,
    });
    const created = await Appointment.findById(result).lean();
    expect(created.reason).toHaveLength(300);
  });

  it('uses default reason when nextAppointmentNotes is empty', async () => {
    const start = futureWeekdayAt(120, 9);
    const result = await ensureNextAppointment({
      nextAppointment: start, patient: patientId, branch: branchId, tenant: tenantId, doctor: doctorId, createdBy: doctorId,
    });
    const created = await Appointment.findById(result).lean();
    expect(created.reason).toBe('Follow-up visit');
  });
});
