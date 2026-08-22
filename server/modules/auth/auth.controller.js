import * as authService from './auth.service.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  cookieOptions,
  setAuthCookies,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import User from '../users/user.model.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { resolveRole } from '../../middleware/checkPermission.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;
  const user = await authService.authenticateUser(email, password);
  setAuthCookies(res, user);
  return sendSuccess(res, { user: user.toSafeObject() });
});

export const logout = asyncHandler(async (req, res) => {
  // Best-effort: try to invalidate the refresh token by bumping tokenVersion.
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      await User.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });
    } catch {
      // Token already invalid — nothing to revoke.
    }
  }
  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Logged out' });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    throw ApiError.unauthorized('Refresh token missing');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await authService.getUserWithTenant(decoded.sub);
  if (!user || !user.isActive) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('User no longer valid');
  }

  await authService.assertTenantActive(user.tenant);

  // Atomic compare-and-swap: only increment if tokenVersion still matches,
  // preventing two concurrent refreshes from both succeeding.
  const updated = await User.findOneAndUpdate(
    { _id: decoded.sub, tokenVersion: decoded.tokenVersion },
    { $inc: { tokenVersion: 1 } },
    { returnDocument: "after" },
  );
  if (!updated) {
    throw ApiError.unauthorized('Token has been rotated, please log in again');
  }

  user.tokenVersion = updated.tokenVersion;
  setAuthCookies(res, user);
  return sendSuccess(res, { message: 'Token refreshed' });
});

export const getMe = asyncHandler(async (req, res) => {
  const result = await authService.getUserWithTenantInfo(req.user);
  return sendSuccess(res, { user: result });
});

export const getMyPermissions = asyncHandler(async (req, res) => {
  const resolved = await resolveRole(req);
  const { isSystemAdmin, permissionMap } = resolved;
  return sendSuccess(res, { isSystemAdmin, permissions: permissionMap() });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const { language, theme } = req.validatedBody;
  const update = {};
  if (language !== undefined) update['preferences.language'] = language;
  if (theme !== undefined) update['preferences.theme'] = theme;

  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { returnDocument: "after" })
    .populate('branch', 'name address phone isActive')
    .populate('tenant', 'plan planModules planId status name isActive');

  const safe = user.toSafeObject();
  return sendSuccess(res, { user: safe });
});

export const verifyImpersonation = asyncHandler(async (req, res) => {
  const token = req.body?.token;
  if (!token) throw ApiError.badRequest('Token is required');

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired impersonation token');
  }

  if (decoded.type !== 'impersonation') {
    throw ApiError.badRequest('Not an impersonation token');
  }

  const user = await User.findById(decoded.sub)
    .populate('branch', 'name address phone isActive')
    .populate('tenant', 'plan planModules planId status name isActive');
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('User no longer exists or is disabled');
  }

  await authService.assertTenantActive(user.tenant);

  if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
    throw ApiError.unauthorized('Token revoked — please request a new impersonation token');
  }

  // Establish the impersonation session by reusing the signed impersonation token as
  // the access cookie. Downstream clinic calls then authenticate through `protect`,
  // which marks the request `_impersonating` so `phiRestrict` can mask patient PHI.
  const maxAge = Math.max(0, (decoded.exp ?? 0) * 1000 - Date.now());
  res.cookie(ACCESS_COOKIE, token, { ...cookieOptions, maxAge });

  const safe = user.toSafeObject();
  return sendSuccess(res, {
    user: {
      ...safe,
      _impersonating: true,
      _impersonator: decoded.impersonatorName || 'Admin',
    },
  });
});
