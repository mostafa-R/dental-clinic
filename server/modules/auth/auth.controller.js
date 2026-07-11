import * as authService from './auth.service.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
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
  await authService.refreshUser(decoded, user.tokenVersion);

  // Atomic increment to prevent race conditions on concurrent refresh requests.
  await User.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });

  user.tokenVersion = (user.tokenVersion || 0) + 1;
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

  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true })
    .populate('branch', 'name address phone isActive')
    .populate('tenant', 'plan planModules planId status name isActive');

  const safe = user.toObject();
  delete safe.password;
  delete safe.refreshToken;
  return sendSuccess(res, { user: safe });
});
