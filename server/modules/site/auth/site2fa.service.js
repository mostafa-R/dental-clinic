import crypto from 'crypto';
import { TOTP, generateSecret } from 'otplib';
import SiteAdmin from '../admin/admin.model.js';
import ApiError from '../../../utils/ApiError.js';

const totp = new TOTP({ window: 1 });

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
  admin.twoFactorBackupCodes = backupCodes;
  await admin.save();

  return { secret, otpauth, backupCodes };
}

export async function verify2fa(adminId, token) {
  const admin = await SiteAdmin.findById(adminId).select('+twoFactorSecret');
  if (!admin) throw ApiError.notFound('Admin not found');
  if (admin.twoFactorEnabled) throw ApiError.conflict('2FA is already enabled');

  const isValid = totp.verify({ token, secret: admin.twoFactorSecret });
  if (!isValid) throw ApiError.badRequest('Invalid token. Try again.');

  admin.twoFactorEnabled = true;
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();
}

export async function disable2fa(adminId, token) {
  const admin = await SiteAdmin.findById(adminId).select('+twoFactorSecret');
  if (!admin) throw ApiError.notFound('Admin not found');
  if (!admin.twoFactorEnabled) throw ApiError.conflict('2FA is not enabled');

  const isValid = totp.verify({ token, secret: admin.twoFactorSecret });
  if (!isValid) throw ApiError.badRequest('Invalid token');

  admin.twoFactorEnabled = false;
  admin.twoFactorSecret = null;
  admin.twoFactorBackupCodes = [];
  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();
}

export async function get2faStatus(adminId) {
  const admin = await SiteAdmin.findById(adminId);
  return { enabled: admin?.twoFactorEnabled || false };
}

export async function verify2faLogin(adminId, { token, backupCode }) {
  const admin = await SiteAdmin.findById(adminId).select('+twoFactorSecret +twoFactorBackupCodes');
  if (!admin) throw ApiError.notFound('Admin not found');
  if (!admin.twoFactorEnabled) throw ApiError.conflict('2FA is not enabled for this account');

  if (token) {
    const isValid = totp.verify({ token, secret: admin.twoFactorSecret });
    if (isValid) {
      admin.lastLogin = new Date();
      await admin.save();
      return true;
    }
  }

  if (backupCode) {
    const idx = admin.twoFactorBackupCodes.indexOf(backupCode);
    if (idx !== -1) {
      admin.twoFactorBackupCodes.splice(idx, 1);
      admin.lastLogin = new Date();
      await admin.save();
      return true;
    }
  }

  throw ApiError.unauthorized('Invalid 2FA token or backup code');
}
