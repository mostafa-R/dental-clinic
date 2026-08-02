import * as siteAuthService from './siteAuth.service.js';
import ApiError from '../../../utils/ApiError.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { SITE_REFRESH_COOKIE, clearAuthCookies, setAuthCookies, verifyRefreshToken } from '../../../utils/jwt.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';

export const siteLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;
  const admin = await siteAuthService.authenticateSiteAdmin(email, password);

  if (admin.twoFactorEnabled) {
    const challengeToken = siteAuthService.create2faChallenge(admin._id);
    return sendSuccess(res, { requires2fa: true, challengeToken, adminId: admin._id });
  }

  await siteAuthService.completeSiteAdminLogin(admin);
  setAuthCookies(res, admin, 'site');
  return sendSuccess(res, { user: admin.toSafeObject() });
});

export const getSiteMe = asyncHandler((req, res) => {
  return sendSuccess(res, { user: req.siteAdmin.toSafeObject() });
});

export const siteRefresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[SITE_REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Refresh token missing');

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const { default: SiteAdmin } = await import('../admin/admin.model.js');
  const admin = await SiteAdmin.findById(decoded.sub);
  if (!admin || !admin.isActive) {
    clearAuthCookies(res, 'site');
    throw ApiError.unauthorized('Admin no longer valid');
  }

  const valid = await siteAuthService.refreshSiteAdmin(decoded, admin.tokenVersion);
  if (!valid) {
    clearAuthCookies(res, 'site');
    throw ApiError.unauthorized('Token has been rotated, please log in again');
  }

  await siteAuthService.rotateSiteAdminToken(admin);
  setAuthCookies(res, admin, 'site');
  return sendSuccess(res, { message: 'Token refreshed' });
});

export const siteLogout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[SITE_REFRESH_COOKIE];
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const { default: SiteAdmin } = await import('../admin/admin.model.js');
      await SiteAdmin.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });
    } catch {
      // Token already invalid — nothing to revoke.
    }
  }
  clearAuthCookies(res, 'site');
  return sendSuccess(res, { message: 'Logged out' });
});

export const createSiteAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.validatedBody;
  const admin = await siteAuthService.createSiteAdmin({ name, email, password, role });
  return sendSuccess(res, { admin: admin.toSafeObject() }, 201);
});

export const recoverSiteAdmin = asyncHandler(async (req, res) => {
  const { email, recoveryKey } = req.validatedBody;
  const { admin, secret, otpauth, backupCodes } = await siteAuthService.recoverSiteAdmin(email, recoveryKey);
  setAuthCookies(res, admin, 'site');
  return sendSuccess(res, {
    user: admin.toSafeObject(),
    requires2faSetup: true,
    secret,
    otpauth,
    backupCodes,
  });
});
