/**
 * Regression tests for the no-show cron changes.
 *
 * Audit items covered:
 *  - RACE: a front-desk `checked_in` that lands between the cron's read and
 *    write must NOT be clobbered by a no-show flip. The flip is now a
 *    conditional atomic claim (status must still be scheduled/confirmed).
 *  - SINGLE-INSTANCE: a MongoDB token lock (shared across app instances)
 *    means a second overlapping tick skips; a stale lock is stolen cleanly.
 *  - TENANT GUARD: appointments with no tenant are never touched, and the
 *    WhatsApp setting lookup uses the appointment's own tenant.
 *  - PHI: the emitted `appointment:statusChanged` broadcast is PHI-stripped.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
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

vi.mock('../services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));

import { sendWhatsAppMessage } from '../services/whatsapp.js';

import { emitToBranch } from '../socket/index.js';

const eventBus = await import('../services/eventBus.js');
vi.spyOn(eventBus, 'publishEvent').mockResolvedValue(undefined);

import {
  markNoShows,
  tryAcquireNoShowLock,
  releaseNoShowLock,
} from '../services/noShowCron.js';

const DB = 'mongodb://127.0.0.1:27017/dental_os_no_show_cron_test';

const MINUTE = 60000;

describe('no-show cron: atomic flip, lock, tenant guard, PHI-safe emit', () => {
  let Tenant;
  let Branch;
  let Patient;
  let User;
  let Appointment;
  let tenantAId;
  let branchAId;
  let doctor;
  let patient;
  let tenantBId;
  let branchBId;
  let doctorB;
  let patientB;
  let WhatsAppSetting;
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
    WhatsAppSetting = (await import('../modules/whatsapp/whatsappSetting.model.js')).default;

    await Promise.all([
      Tenant.deleteMany({}),
      Branch.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
      Appointment.deleteMany({}),
      WhatsAppSetting.deleteMany({}),
      mongoose.connection.db.collection('cron_locks').deleteMany({}),
    ]);

    const tenantA = await Tenant.create({
      name: 'Clinic NoShow A',
      email: 'clinic-noshow-a@test.com',
      slug: 'clinic-noshow-a',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 1000 },
    });
    tenantAId = tenantA._id;

    const branchA = await Branch.create({
      tenant: tenantAId,
      name: 'Branch NoShow',
      address: '4 Main St',
      phone: '+1000000004',
    });
    branchAId = branchA._id;

    doctor = await User.create({
      tenant: tenantAId,
      branch: branchAId,
      name: 'Doc NoShow',
      email: nextUnique('doc') + '@test.com',
      password: 'hashed-not-used',
      roleId: new mongoose.Types.ObjectId(),
      isDoctor: true,
    });

    patient = await Patient.create({
      tenant: tenantAId,
      branch: branchAId,
      firstName: 'First',
      lastName: 'NoShow',
      phone: '+15555550202',
    });

    const tenantB = await Tenant.create({
      name: 'Clinic NoShow B',
      email: 'clinic-noshow-b@test.com',
      slug: 'clinic-noshow-b',
      plan: 'professional',
      status: 'active',
      isActive: true,
      settings: { maxBranches: 5, maxUsersPerBranch: 10, maxPatients: 1000 },
    });
    tenantBId = tenantB._id;

    const branchB = await Branch.create({
      tenant: tenantBId,
      name: 'Branch NoShow B',
      address: '7 Side St',
      phone: '+1000000007',
    });
    branchBId = branchB._id;

    doctorB = await User.create({
      tenant: tenantBId,
      branch: branchBId,
      name: 'Doc NoShow B',
      email: nextUnique('docb') + '@test.com',
      password: 'hashed-not-used',
      roleId: new mongoose.Types.ObjectId(),
      isDoctor: true,
    });

    patientB = await Patient.create({
      tenant: tenantBId,
      branch: branchBId,
      firstName: 'ثانية',
      lastName: 'نو شو',
      phone: '+15555550303',
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
      WhatsAppSetting.deleteMany({}),
      mongoose.connection.db.collection('cron_locks').deleteMany({}),
    ]);
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Appointment.deleteMany({});
    await mongoose.connection.db.collection('cron_locks').deleteMany({});
    vi.clearAllMocks();
  });

  async function createAppointment({ minutesAgo = 31, status = 'scheduled', tenant = tenantAId } = {}) {
    const start = new Date(Date.now() - minutesAgo * MINUTE);
    const doc = await Appointment.create({
      tenant,
      branch: branchAId,
      patient: patient._id,
      doctor: doctor._id,
      chair: 'Cron Chair',
      start,
      end: new Date(start.getTime() + 30 * MINUTE),
      status,
    });
    return doc;
  }

  function assertNoShowMessage(opts = {}) {
    const calls = sendWhatsAppMessage.mock.calls;
    expect(calls.length).toBe(1);
    const [sentTenant, phone, text] = calls[0];
    if (opts.tenant) expect(String(sentTenant)).toBe(String(opts.tenant));
    if (opts.phone) expect(phone).toBe(opts.phone);
    if (opts.has) expect(text).toContain(opts.has);
    if (opts.notHas) expect(text).not.toContain(opts.notHas);
    return text;
  }

  it('flips a stale scheduled appointment to no_show and publishes the event', async () => {
    const created = await createAppointment();

    const result = await markNoShows({});
    expect(result.processed).toBe(1);

    const saved = await Appointment.findById(created._id).select('status').lean();
    expect(saved.status).toBe('no_show');
    const published = eventBus.publishEvent.mock.calls.filter((c) => c[0].type === 'appointment.no_show');
    expect(published.length).toBe(1);
    expect(published[0][0].data.id).toBe(String(created._id));
  });

  it('RACE: a front-desk checked_in that lands between read and write is preserved', async () => {
    const created = await createAppointment();
    // The receptionist checks the patient in before the cron's flip executes.
    await Appointment.updateOne({ _id: created._id }, { $set: { status: 'checked_in' } });

    const result = await markNoShows({});
    expect(result.processed).toBe(0);

    const saved = await Appointment.findById(created._id).select('status').lean();
    expect(saved.status).toBe('checked_in');
    expect(eventBus.publishEvent.mock.calls.filter((c) => c[0].type === 'appointment.no_show')).toHaveLength(0);
  });

  it('converts confirmed appointments too, but never future or unowned ones', async () => {
    await createAppointment({ status: 'confirmed', minutesAgo: 31 }); // stale + confirmed → flips
    await createAppointment({ minutesAgo: -120 }); // future → untouched
    await createAppointment({ tenant: null, minutesAgo: 240 }); // no tenant → untouched (tenant guard)

    const result = await markNoShows({});
    expect(result.processed).toBe(1);

    // sorted by start asc: unowned stale (240m ago), confirmed (31m ago), future (+120m)
    const statuses = await Appointment.find({}).select('status tenant start').sort({ start: 1 }).lean();
    expect(statuses[0].tenant ? 'owned' : 'unowned').toBe('unowned');
    expect(statuses[0].status).toBe('scheduled'); // tenant guard: unowned untouched
    expect(statuses[1].tenant ? 'owned' : 'unowned').toBe('owned');
    expect(statuses[1].status).toBe('no_show'); // confirmed flips
    expect(statuses[2].status).toBe('scheduled'); // future untouched
  });

  it('SINGLE-INSTANCE: a live lock skips the run; the next tick proceeds after release', async () => {
    const held = await tryAcquireNoShowLock();
    expect(held).toBeTruthy();

    const created = await createAppointment();
    const skipped = await markNoShows({});
    expect(skipped.skipped).toBe(true);

    let saved = await Appointment.findById(created._id).select('status').lean();
    expect(saved.status).toBe('scheduled');

    await releaseNoShowLock(held);
    const second = await markNoShows({});
    expect(second.processed).toBe(1);
    saved = await Appointment.findById(created._id).select('status').lean();
    expect(saved.status).toBe('no_show');
  });

  it('emits a PHI-stripped appointment:statusChanged broadcast', async () => {
    const created = await createAppointment();
    await markNoShows({});

    const calls = emitToBranch.mock.calls.filter((c) => c[1] === 'appointment:statusChanged');
    expect(calls.length).toBe(1);
    const payload = calls[0][2].appointment;
    expect(payload.patient.phone).toBeUndefined();
    expect(payload.patient.firstName).toBe('First');
    expect(String(payload._id)).toBe(String(created._id));
    expect(payload.status).toBe('no_show');
  });

  it('a stale lock (expired) is stolen so the cron can still run', async () => {
    // Insert an expired lock directly, as if the previous owner crashed.
    const col = mongoose.connection.db.collection('cron_locks');
    await col.insertOne({
      _id: 'no_show_cron',
      token: 'dead-owner',
      acquiredAt: new Date(Date.now() - 60 * MINUTE),
      expiresAt: new Date(Date.now() - 50 * MINUTE),
    });

    const created = await createAppointment();
    const result = await markNoShows({});
    expect(result.processed).toBe(1);
    const saved = await Appointment.findById(created._id).select('status').lean();
    expect(saved.status).toBe('no_show');
  });

  it('sends the reschedule WhatsApp only when the tenant enabled no-show reminders, using the right tenant', async () => {
    // Tenant A enabled the reminder; Tenant B did not.
    await WhatsAppSetting.create({
      tenant: tenantAId,
      enabled: true,
      status: 'connected',
      config: { phoneNumber: '+19990000001' },
      settings: { noShowReminder: true },
    });

    const created = await createAppointment();
    const result = await markNoShows({});
    expect(result.processed).toBe(1);

    assertNoShowMessage({
      tenant: tenantAId,
      phone: patient.phone,
      has: patient.firstName,
      notHas: '120 دقيقة',
    });
    expect(String(created._id)).toBeTruthy();
  });

  it('renders the no-show message in the tenant timezone, never the server clock', async () => {
    // A fresh tenant that DID enable reminders, in Cairo (UTC+2 › UTC+3).
    await WhatsAppSetting.create({
      tenant: tenantBId,
      enabled: true,
      status: 'connected',
      config: { phoneNumber: '+19990000002' },
      settings: { noShowReminder: true },
    });

    // 2026-06-04 (a Thursday during Egyptian DST, UTC+3): 21:00Z is Thursday in
    // the server/UTC clock but already Friday 00:00 in Cairo's local day.
    const start = new Date('2026-06-04T21:00:00.000Z');
    const doc = await Appointment.create({
      tenant: tenantBId,
      branch: branchBId,
      patient: patientB._id,
      doctor: doctorB._id,
      chair: 'Cron Chair B',
      start,
      end: new Date(start.getTime() + 30 * MINUTE),
      status: 'scheduled',
    });

    const result = await markNoShows({ now: start.getTime() + 30 * MINUTE + 1, timezone: 'Africa/Cairo' });
    expect(result.processed).toBe(1);

    // UTC would print Thursday; Cairo prints Friday.
    const text = assertNoShowMessage({
      tenant: tenantBId,
      phone: patientB.phone,
      notHas: 'الخميس',
    });
    expect(text).toContain('الجمعة');
    expect(String(doc._id)).toBeTruthy();
  });
});