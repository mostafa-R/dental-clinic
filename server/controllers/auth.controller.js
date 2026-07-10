import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { sendSuccess } from '../utils/sendSuccess.js';
import { resolveRole } from '../middleware/checkPermission.js';

/**
 * When the user belongs to a tenant, make sure the tenant subscription is in
 * a usable state. Users with no tenant (the legacy/platform setup from the
 * seeder) skip this check entirely.
 */
async function assertTenantActive(tenantId) {
  if (!tenantId) return;
  const tenant = await Tenant.findById(tenantId).select('status isActive');
  if (!tenant) {
    throw ApiError.forbidden('Your clinic account no longer exists');
  }
  if (!tenant.isActive || tenant.status === 'suspended' || tenant.status === 'cancelled') {
    throw ApiError.forbidden('Your clinic subscription is suspended. Contact your platform administrator.');
  }
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;

  const user = await User.findOne({ email }).select('+password').populate('branch');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('Account is disabled');
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Block login for users whose tenant subscription is suspended/cancelled.
  await assertTenantActive(user.tenant);

  setAuthCookies(res, user);

  return sendSuccess(res, { user: user.toSafeObject() });
});

export const logout = asyncHandler((_req, res) => {
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

  const user = await User.findById(decoded.sub);
  if (!user || !user.isActive) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('User no longer valid');
  }

  await assertTenantActive(user.tenant);

  // Token rotation: if the JWT has a tokenVersion, verify it matches.
  // Old JWTs without tokenVersion are accepted once (backward compat),
  // then the version is incremented so old tokens are invalidated.
  if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Token has been rotated, please log in again');
  }

  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  setAuthCookies(res, user);

  return sendSuccess(res, { message: 'Token refreshed' });
});

export const getMe = asyncHandler(async (req, res) => {
  const user = req.user.toSafeObject();

  // Attach tenant status for suspension checks
  if (user.tenant) {
    const tenant = await Tenant.findById(user.tenant).select('status isActive name').lean();
    if (tenant) {
      user.tenant = {
        _id: tenant._id,
        name: tenant.name,
        status: tenant.status,
        isActive: tenant.isActive,
      };
    }
  }

  return sendSuccess(res, { user });
});

export const getMyPermissions = asyncHandler(async (req, res) => {
  const resolved = await resolveRole(req);
  const { isSystemAdmin, permissionMap } = resolved;
  return sendSuccess(res, {
    isSystemAdmin,
    permissions: permissionMap(),
  });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const { language, theme } = req.validatedBody;

  if (language !== undefined) req.user.preferences.language = language;
  if (theme !== undefined) req.user.preferences.theme = theme;

  await req.user.save();
  // password is select:false; toSafeObject strips it regardless.
  await req.user.populate('branch', 'name address phone isActive');

  return sendSuccess(res, { user: req.user.toSafeObject() });
});
