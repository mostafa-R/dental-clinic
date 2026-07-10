import crypto from 'crypto';
import { TOTP, generateSecret } from 'otplib';
import SiteAdmin from '../models/SiteAdmin.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/sendSuccess.js';

const totp = new TOTP({ window: 1 });

export const setup2fa = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.siteAdmin._id);
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

  return sendSuccess(res, {
    secret,
    otpauth,
    backupCodes,
  });
});

export const verify2fa = asyncHandler(async (req, res) => {
  const { token } = req.validatedBody;
  const admin = await SiteAdmin.findById(req.siteAdmin._id).select('+twoFactorSecret');
  if (!admin) throw ApiError.notFound('Admin not found');

  if (admin.twoFactorEnabled) {
    throw ApiError.conflict('2FA is already enabled');
  }

  const isValid = totp.verify({ token, secret: admin.twoFactorSecret });
  if (!isValid) {
    throw ApiError.badRequest('Invalid token. Try again.');
  }

  admin.twoFactorEnabled = true;
  await admin.save();

  req.auditDetails = { action: '2fa.enable' };

  return sendSuccess(res, { message: '2FA has been enabled successfully' });
});

export const disable2fa = asyncHandler(async (req, res) => {
  const { token } = req.validatedBody;
  const admin = await SiteAdmin.findById(req.siteAdmin._id).select('+twoFactorSecret');
  if (!admin) throw ApiError.notFound('Admin not found');

  if (!admin.twoFactorEnabled) {
    throw ApiError.conflict('2FA is not enabled');
  }

  const isValid = totp.verify({ token, secret: admin.twoFactorSecret });
  if (!isValid) {
    throw ApiError.badRequest('Invalid token');
  }

  admin.twoFactorEnabled = false;
  admin.twoFactorSecret = null;
  admin.twoFactorBackupCodes = [];
  await admin.save();

  req.auditDetails = { action: '2fa.disable' };

  return sendSuccess(res, { message: '2FA has been disabled' });
});

export const get2faStatus = asyncHandler(async (req, res) => {
  const admin = await SiteAdmin.findById(req.siteAdmin._id);
  return sendSuccess(res, {
    enabled: admin?.twoFactorEnabled || false,
  });
});

export const verify2faLogin = asyncHandler(async (req, res) => {
  const { adminId, token, backupCode } = req.validatedBody;
  const admin = await SiteAdmin.findById(adminId).select('+twoFactorSecret +twoFactorBackupCodes');
  if (!admin) throw ApiError.notFound('Admin not found');

  if (!admin.twoFactorEnabled) {
    throw ApiError.conflict('2FA is not enabled for this account');
  }

  // Try TOTP first
  if (token) {
  const isValid = totp.verify({ token, secret: admin.twoFactorSecret });
    if (isValid) {
      admin.lastLogin = new Date();
      await admin.save();
      return sendSuccess(res, { verified: true });
    }
  }

  // Try backup codes
  if (backupCode) {
    const idx = admin.twoFactorBackupCodes.indexOf(backupCode);
    if (idx !== -1) {
      admin.twoFactorBackupCodes.splice(idx, 1);
      admin.lastLogin = new Date();
      await admin.save();
      return sendSuccess(res, { verified: true });
    }
  }

  throw ApiError.unauthorized('Invalid 2FA token or backup code');
});
