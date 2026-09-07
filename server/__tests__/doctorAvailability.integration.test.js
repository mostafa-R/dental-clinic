/**
 * Regression test for the doctor 'not working' onboarding trap.
 *
 * Audit finding: the User schema defaulted every doctor's workingHours day to
 * { notWorking: true }, so a freshly-onboarded doctor (who has not configured
 * a custom schedule yet) reported 'Doctor does not work on X' for EVERY day —
 * making their first appointment impossible to book. The schema comment
 * promised the opposite: "If not set, falls back to clinic hours."
 *
 * Fix: the day-level default is now { open: null, close: null, notWorking: false }.
 * A day left unconfigured therefore falls through to the clinic-hours check
 * (enforced separately) instead of blocking the doctor, while an EXPLICIT
 * notWorking:true (or an explicit open/close range) is still honoured.
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
vi.mock('../core/transaction.js', () => ({
  withTransaction: vi.fn(async (fn) => fn({})),
}));
vi.mock('../socket/index.js', () => ({
  emitToBranch: vi.fn(() => {}),
  emitToTenant: vi.fn(() => {}),
  emitToTenantQueue: vi.fn(() => {}),
}));

const DB = 'mongodb://127.0.0.1:27017/dental_os_doctor_availability_test';

// Clinic open Mon–Fri 09:00–17:00 (defaults from branch.model.js).
const MON = new Date('2026-09-14T09:00:00.000Z'); // Monday
const MON_OPEN = new Date('2026-09-14T10:00:00.000Z');
const SAT = new Date('2026-09-19T10:00:00.000Z'); // Saturday (clinic closed)

describe('doctor onboarding working-hours default', () => {
  let User;
  let seq = 0;

  beforeAll(async () => {
    await mongoose.connect(DB);
    User = (await import('../modules/users/user.model.js')).default;
    await User.deleteMany({});
    await User.syncIndexes();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.disconnect();
  });

  function fakeDoctor(overrides = {}) {
    // A brand-new doctor with NO custom hours configured.
    return new User({
      name: 'Dr Default' + (++seq),
      email: 'dr' + seq + '@test.com',
      password: 'hashed-not-used',
      roleId: new mongoose.Types.ObjectId(),
      isDoctor: true,
      ...overrides,
    });
  }

  it('a new doctor with no custom hours is available (falls back to clinic hours)', async () => {
    const doc = fakeDoctor();
    const result = doc.isAvailableAt(MON_OPEN, new Date(MON_OPEN.getTime() + 30 * 60000));
    expect(result.available).toBe(true);
    expect(result.available && result.reason === undefined).toBe(true);
  });

  it('an explicitly not-working day still blocks the doctor', async () => {
    const doc = fakeDoctor({
      workingHours: {
        sunday: { open: null, close: null, notWorking: true },
        monday: { open: '09:00', close: '17:00', notWorking: false },
      },
    });
    // Sunday is explicitly notWorking -> hard-blocked (no clinic fallback).
    const SUN = new Date('2026-09-13T10:00:00.000Z');
    expect(doc.isAvailableAt(SUN, new Date(SUN.getTime() + 30 * 60000)).available).toBe(false);

    // Monday is configured open, so available...
    const result = doc.isAvailableAt(MON_OPEN, new Date(MON_OPEN.getTime() + 30 * 60000));
    expect(result.available).toBe(true);
    // ...and an unconfigured/default day (e.g. Saturday) is NOT hard-blocked.
    const sat = doc.isAvailableAt(SAT, new Date(SAT.getTime() + 30 * 60000));
    expect(sat.available).toBe(true); // falls back to clinic; clinic closed rule handled elsewhere
  });

  it('default workingHours are open/close null + notWorking false', async () => {
    const doc = fakeDoctor();
    const monday = doc.workingHours?.monday?.toObject ? doc.workingHours.monday.toObject() : doc.workingHours.monday;
    expect(monday).toBeDefined();
    if (monday) {
      expect(monday.open).toBeNull();
      expect(monday.close).toBeNull();
      expect(monday.notWorking).toBe(false);
    }
  });

  it('persists a doctor without custom hours and they remain bookable', async () => {
    const doc = fakeDoctor();
    const saved = await doc.save();
    const reloaded = await User.findById(saved._id);
    const result = reloaded.isAvailableAt(MON_OPEN, new Date(MON_OPEN.getTime() + 30 * 60000));
    expect(result.available).toBe(true);
  });
});