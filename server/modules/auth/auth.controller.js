import * as authService from './auth.service.js';
import jwt from 'jsonwebtoken';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { consumeGrant, consumeHandoff } from '../../utils/impersonationGrant.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  cookieOptions,
  setAuthCookies,
  setCsrfCookie,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import User from '../users/user.model.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { resolveRole } from '../../middleware/checkPermission.js';
import { resolveTenantTimezone } from '../../utils/timezoneUtils.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;
  const user = await authService.authenticateUser(email, password);
  setAuthCookies(res, user);
  return sendSuccess(res, { user: await authService.attachRole(user.toSafeObject()) });
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
  // The clinic's IANA zone. The client has no other way to learn it, and it is
  // the reference for every "today"/"this day" question the UI asks — a browser
  // in a different zone used to resolve date-only inputs and format timestamps
  // against its own locale, which put appointments, recalls and the day-close
  // screens a day out for clinics not on the receptionist's timezone. Sent on
  // both branches so a system admin also gets a sane default rather than
  // `undefined`.
  const timezone = resolveTenantTimezone(req.user?.tenant);
  // System admins bypass the plan gate everywhere (see checkPermission).
  if (isSystemAdmin) {
    return sendSuccess(res, { isSystemAdmin, permissions: permissionMap(), timezone });
  }
  // Intersect role permissions with the tenant's plan modules so the clinic
  // frontend (Sidebar / RequirePermission) automatically hides modules the
  // plan does not include. Without this the UI showed everything the role
  // allowed and only the API 403'd — looking like "the plan is ignored".
  // A missing tenant for a non-admin is deny-all, never full access.
  const { planIncludesModule } = await import('../../constants/plans.js');
  const tenant = req.user?.tenant || null;
  const raw = permissionMap();
  const permissions = Object.fromEntries(
    Object.entries(raw).map(([mod, actions]) => [
      mod,
      tenant && planIncludesModule(tenant, mod) ? actions : [],
    ]),
  );
  return sendSuccess(res, {
    isSystemAdmin,
    permissions,
    plan: tenant?.plan ?? null,
    planModules: tenant?.planModules ?? [],
    timezone,
  });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const { language, theme } = req.validatedBody;
  const update = {};
  if (language !== undefined) update['preferences.language'] = language;
  if (theme !== undefined) update['preferences.theme'] = theme;

  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { returnDocument: "after" })
    .populate('branch', 'name address phone isActive')
    .populate('tenant', 'plan planModules planId status name isActive');

  const safe = await authService.attachRole(user.toSafeObject());
  return sendSuccess(res, { user: safe });
});

export const verifyImpersonation = asyncHandler(async (req, res) => {
  const { code } = req.body ?? {};
  // Preferred path: a 60-second, single-use handoff code. This is what the
  // dashboard puts in the URL, so the grant itself never reaches browser
  // history, a Referer header, or an access log.
  let token = code ? await consumeHandoff(code) : req.body?.token;

  if (!token) {
    throw ApiError.unauthorized(
      code
        ? 'This impersonation link has expired or was already used'
        : 'Token is required',
    );
  }

  let decoded;
  try {
    // Verified with the dedicated impersonation secret, so an ordinary access
    // token can never be presented here.
    decoded = jwt.verify(token, process.env.JWT_IMPERSONATION_SECRET || process.env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired impersonation token');
  }

  if (decoded.type !== 'impersonation') {
    throw ApiError.badRequest('Not an impersonation token');
  }

  // Single-use: consumed atomically, so a captured token cannot be replayed
  // for the remainder of its 30-minute lifetime.
  if (!(await consumeGrant(decoded.jti))) {
    throw ApiError.unauthorized('This impersonation grant has already been used or revoked');
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
  res.cookie(ACCESS_COOKIE, token, { ...cookieOptions(), maxAge });
  setCsrfCookie(res);

const safe = await authService.attachRole(user.toSafeObject());
  return sendSuccess(res, {
    user: {
      ...safe,
      _impersonating: true,
      _impersonator: decoded.impersonatorName || 'Admin',
    },
  });
});
