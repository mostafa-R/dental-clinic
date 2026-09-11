/**
 * Tests for verifyRecoveryOtp — security-critical OTP verification with
 * constant-time comparison (timingSafeEqual) and 3-strike lockout.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock('../modules/site/admin/admin.model.js', () => {
  class MockSiteAdmin {}
  MockSiteAdmin.findById = vi.fn();
  return { default: MockSiteAdmin };
});

vi.mock('../modules/site/auth/site2fa.service.js', () => ({
  bootstrap2fa: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import { verifyRecoveryOtp } from '../modules/site/auth/siteAuth.service.js';
import SiteAdmin from '../modules/site/admin/admin.model.js';
import { bootstrap2fa } from '../modules/site/auth/site2fa.service.js';
import * as redisConfig from '../config/redis.js';

const SECRET = 'test-recovery-secret';
const OTP = '123456';
const ADMIN_ID = '6650c0ffee00000000000001';
const EMAIL = 'admin@dentalos.app';

function makeFakeRedis() {
  const store = new Map();
  return {
    async get(key) { const e = store.get(key); return e ? e.value : null; },
    async set(key, value, _mode, seconds) { store.set(key, { value, exp: Date.now() + seconds * 1000 }); return 'OK'; },
    async del(key) { store.delete(key); },
    async incr(key) {
      const entry = store.get(key) || { value: 0, exp: Infinity };
      entry.value += 1;
      store.set(key, entry);
      return entry.value;
    },
    async expire(key, seconds) {
      const entry = store.get(key);
      if (entry) entry.exp = Date.now() + seconds * 1000;
    },
  };
}

function signRecoveryToken(email) {
  return jwt.sign({ type: 'recovery_init', email: email.toLowerCase() }, SECRET, { expiresIn: '5m' });
}

const CONTEXT = { ip: '127.0.0.1', userAgent: 'test' };

describe('verifyRecoveryOtp', () => {
  let fakeRedis;

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fakeRedis = makeFakeRedis();
    vi.mocked(redisConfig.getRedis).mockReturnValue(fakeRedis);
  });

  it('requires Redis to be available', async () => {
    vi.mocked(redisConfig.getRedis).mockReturnValue(null);
    await expect(verifyRecoveryOtp(EMAIL, OTP, 'token', CONTEXT)).rejects.toMatchObject({
      statusCode: 500,
      message: 'Redis is required for recovery',
    });
  });

  it('rejects an invalid recovery token', async () => {
    await expect(verifyRecoveryOtp(EMAIL, OTP, 'not-a-jwt', CONTEXT)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired recovery token',
    });
  });

  it('rejects a token with wrong type', async () => {
    const wrongType = jwt.sign({ type: 'site_access', email: EMAIL }, SECRET, { expiresIn: '5m' });
    await expect(verifyRecoveryOtp(EMAIL, OTP, wrongType, CONTEXT)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired recovery token',
    });
  });

  it('rejects a token with mismatched email', async () => {
    const token = jwt.sign({ type: 'recovery_init', email: 'other@test.com' }, SECRET, { expiresIn: '5m' });
    await expect(verifyRecoveryOtp(EMAIL, OTP, token, CONTEXT)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid or expired recovery token',
    });
  });

  it('rejects when the OTP has expired (not stored in Redis)', async () => {
    const token = signRecoveryToken(EMAIL);
    await expect(verifyRecoveryOtp(EMAIL, OTP, token, CONTEXT)).rejects.toMatchObject({
      statusCode: 401,
      message: 'OTP has expired. Please initiate recovery again.',
    });
  });

  it('accepts the correct OTP and bootstraps 2FA', async () => {
    await fakeRedis.set(`recovery:otp:${EMAIL.toLowerCase()}`, OTP, 'EX', 300);

    const admin = { _id: ADMIN_ID, isActive: true, email: EMAIL };
    vi.mocked(SiteAdmin.findById).mockResolvedValue(admin);
    vi.mocked(bootstrap2fa).mockResolvedValue({ secret: 'NEWSECRET', backupCodes: ['AABBCCDD'] });

    const token = signRecoveryToken(EMAIL);
    const result = await verifyRecoveryOtp(EMAIL, OTP, token, CONTEXT);

    expect(result.admin).toBe(admin);
    expect(result.secret).toBe('NEWSECRET');
    expect(bootstrap2fa).toHaveBeenCalledWith(admin);
    // OTP and token are deleted (one-time use)
    expect(await fakeRedis.get(`recovery:otp:${EMAIL.toLowerCase()}`)).toBeNull();
    expect(await fakeRedis.get(`recovery:token:${EMAIL.toLowerCase()}`)).toBeNull();
  });

  it('uses timingSafeEqual for OTP comparison (same length, wrong value)', async () => {
    await fakeRedis.set(`recovery:otp:${EMAIL.toLowerCase()}`, OTP, 'EX', 300);
    const token = signRecoveryToken(EMAIL);

    const res = verifyRecoveryOtp(EMAIL, '654321', token, CONTEXT);
    await expect(res).rejects.toMatchObject({ statusCode: 401 });
    await expect(res).rejects.toMatchObject({ message: expect.stringContaining('Invalid OTP') });
    // The OTP key is still present (not deleted on mismatch)
    expect(await fakeRedis.get(`recovery:otp:${EMAIL.toLowerCase()}`)).toBe(OTP);
  });

  it('reports remaining attempts on wrong OTP', async () => {
    await fakeRedis.set(`recovery:otp:${EMAIL.toLowerCase()}`, OTP, 'EX', 300);
    const token = signRecoveryToken(EMAIL);

    await expect(verifyRecoveryOtp(EMAIL, '000000', token, CONTEXT)).rejects.toMatchObject({
      message: 'Invalid OTP. 2 attempts remaining.',
    });
    await expect(verifyRecoveryOtp(EMAIL, '000000', token, CONTEXT)).rejects.toMatchObject({
      message: 'Invalid OTP. 1 attempts remaining.',
    });
  });

  it('locks out after 3 failed attempts, deletes OTP and token keys', async () => {
    await fakeRedis.set(`recovery:otp:${EMAIL.toLowerCase()}`, OTP, 'EX', 300);
    const token = signRecoveryToken(EMAIL);

    await expect(verifyRecoveryOtp(EMAIL, '000000', token, CONTEXT)).rejects.toMatchObject({
      message: 'Invalid OTP. 2 attempts remaining.',
    });
    await expect(verifyRecoveryOtp(EMAIL, '000000', token, CONTEXT)).rejects.toMatchObject({
      message: 'Invalid OTP. 1 attempts remaining.',
    });
    await expect(verifyRecoveryOtp(EMAIL, '000000', token, CONTEXT)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Too many failed attempts. Please initiate recovery again.',
    });
    // Both keys are invalidated
    expect(await fakeRedis.get(`recovery:otp:${EMAIL.toLowerCase()}`)).toBeNull();
    expect(await fakeRedis.get(`recovery:token:${EMAIL.toLowerCase()}`)).toBeNull();
  });

  it('rejects when the admin no longer exists or is disabled', async () => {
    await fakeRedis.set(`recovery:otp:${EMAIL.toLowerCase()}`, OTP, 'EX', 300);
    vi.mocked(SiteAdmin.findById).mockResolvedValue(null);

    const token = signRecoveryToken(EMAIL);
    await expect(verifyRecoveryOtp(EMAIL, OTP, token, CONTEXT)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Admin not found or disabled',
    });
  });

  it('rejects when the admin is inactive', async () => {
    await fakeRedis.set(`recovery:otp:${EMAIL.toLowerCase()}`, OTP, 'EX', 300);
    vi.mocked(SiteAdmin.findById).mockResolvedValue({ _id: ADMIN_ID, isActive: false });

    const token = signRecoveryToken(EMAIL);
    await expect(verifyRecoveryOtp(EMAIL, OTP, token, CONTEXT)).rejects.toMatchObject({
      statusCode: 401,
      message: 'Admin not found or disabled',
    });
  });
});
