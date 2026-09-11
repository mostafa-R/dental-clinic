import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { TOTP, generateSecret, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import SiteAdmin from '../admin/admin.model.js';
import ApiError from '../../../utils/ApiError.js';
import { getRedis } from '../../../config/redis.js';

const totp = new TOTP({
  window: 1,
  epochTolerance: 30,
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

// Per-account 2FA attempt throttle (H8): brute-forcing a 6-digit TOTP or
// backup code is a game of probability — a lock caps the attempts per account
// rather than per IP, so rotating IPs cannot buy unlimited guesses.
const TFA_FAIL_PREFIX = '2fa:fail:';
const TFA_LOCK_PREFIX = '2fa:lock:';
const TFA_MAX_ATTEMPTS = 5;
const TFA_LOCK_SECONDS = 15 * 60;

function redisReady() {
  const redis = getRedis();
  return redis?.status === 'ready' ? redis : null;
}

async function assertNotTfaLocked(adminId) {
  const redis = redisReady();
  if (!redis) return;
  const ttl = await redis.ttl(`${TFA_LOCK_PREFIX}${String(adminId)}`);
  if (ttl > 0) {
    throw ApiError.tooManyRequests(
      `Too many 2FA attempts. Please try again in ${Math.ceil(ttl / 60)} minute(s).`,
    );
  }
}

async function recordTfaFailure(adminId) {
  const redis = redisReady();
  if (!redis) return;
  const failKey = `${TFA_FAIL_PREFIX}${String(adminId)}`;
  const count = await redis.incr(failKey);
  if (count === 1) await redis.expire(failKey, 15 * 60);
  if (count >= TFA_MAX_ATTEMPTS) {
    await redis.del(failKey);
    await redis.set(`${TFA_LOCK_PREFIX}${String(adminId)}`, '1', 'EX', TFA_LOCK_SECONDS);
  }
}

async function resetTfaFailures(adminId) {
  const redis = redisReady();
  if (!redis) return;
  await redis.del(`${TFA_FAIL_PREFIX}${String(adminId)}`);
  await redis.del(`${TFA_LOCK_PREFIX}${String(adminId)}`);
}

export async function bootstrap2fa(admin) {
  const secret = generateSecret();
  const otpauth = totp.toURI({ issuer: 'Dental OS', label: admin.email, secret });

  const backupCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8),
  );

  admin.twoFactorSecret = secret;
  const hashedCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
  admin.twoFactorBackupCodes = hashedCodes;
  admin.twoFactorEnabled = true;
  // Revoke every existing session: any 2FA state change invalidates old tokens
  // so a session created before the change can never claim to be verified.
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();

  return { secret, otpauth, backupCodes };
}

export async function setup2fa(adminId) {
  const admin = await SiteAdmin.findById(adminId);
  if (!admin) throw ApiError.notFound('Admin not found');
  if (admin.twoFactorEnabled) {
    throw ApiError.conflict('2FA is already enabled. Disable it first to reconfigure.');
  }

  const secret = generateSecret();
  const otpauth = totp.toURI({ issuer: 'Dental OS', label: admin.email, secret });

  const backupCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8),
  );

  admin.twoFactorSecret = secret;
  const hashedCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
  admin.twoFactorBackupCodes = hashedCodes;
  await admin.save();

  return { secret, otpauth, backupCodes };
}

export async function verify2fa(adminId, token) {
  const admin = await SiteAdmin.findById(adminId).select('+twoFactorSecret');
  if (!admin) throw ApiError.notFound('Admin not found');
  if (admin.twoFactorEnabled) throw ApiError.conflict('2FA is already enabled');

  const result = await totp.verify(token, { secret: admin.twoFactorSecret });
  if (!result.valid) throw ApiError.badRequest('Invalid token. Try again.');

  admin.twoFactorEnabled = true;
  admin.tokenVersion = (admin.tokenVersion || 0) + 1; // invalidate existing sessions on 2FA enable
  await admin.save();
  return admin;
}

export async function disable2fa(adminId, token) {
  const admin = await SiteAdmin.findById(adminId).select('+twoFactorSecret');
  if (!admin) throw ApiError.notFound('Admin not found');
  if (!admin.twoFactorEnabled) throw ApiError.conflict('2FA is not enabled');

  const result = await totp.verify(token, { secret: admin.twoFactorSecret });
  if (!result.valid) throw ApiError.badRequest('Invalid token');

  admin.twoFactorEnabled = false;
  admin.twoFactorSecret = null;
  admin.twoFactorBackupCodes = [];
  admin.tokenVersion = (admin.tokenVersion || 0) + 1; // invalidate existing sessions on 2FA disable
  await admin.save();
  return admin;
}

export async function get2faStatus(adminId) {
  const admin = await SiteAdmin.findById(adminId);
  return { enabled: admin?.twoFactorEnabled || false };
}

export async function verify2faLogin(adminId, { token, backupCode }) {
  await assertNotTfaLocked(adminId);

  const admin = await SiteAdmin.findById(adminId).select('+twoFactorSecret +twoFactorBackupCodes');
  if (!admin) throw ApiError.notFound('Admin not found');
  if (!admin.twoFactorEnabled) throw ApiError.conflict('2FA is not enabled for this account');

  if (token) {
    const result = await totp.verify(token, { secret: admin.twoFactorSecret });
    if (result.valid) {
      await resetTfaFailures(adminId);
      admin.lastLogin = new Date();
      await admin.save();
      return true;
    }
  }

  if (backupCode) {
    const idx = await admin.twoFactorBackupCodes.reduce(async (prevPromise, hashedCode, i) => {
      const prev = await prevPromise;
      if (prev !== -1) return prev;
      const match = await bcrypt.compare(backupCode, hashedCode);
      return match ? i : -1;
    }, Promise.resolve(-1));

    if (idx !== -1) {
      admin.twoFactorBackupCodes.splice(idx, 1);
      admin.lastLogin = new Date();
      await admin.save();
      await resetTfaFailures(adminId);
      return true;
    }
  }

  await recordTfaFailure(adminId);
  throw ApiError.unauthorized('Invalid 2FA token or backup code');
}
