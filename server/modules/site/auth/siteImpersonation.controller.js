import jwt from 'jsonwebtoken';
import ApiError from "../../../utils/ApiError.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";
import User from "../../users/user.model.js";
import Role from "../../users/role.model.js";
import Tenant from "../tenant/tenant.model.js";

/**
 * POST /site/impersonation/start
 * Generate a clinic-user token for the requesting site admin so they can
 * temporarily act as a specific clinic user for support purposes.
 *
 * Security measures:
 * - Only super_admin / admin roles can impersonate.
 * - 2FA must be enabled (enforced by require2fa middleware).
 * - The impersonation session is logged in AuditLog.
 * - The generated token is short-lived (30 min).
 * - PHI-sensitive routes check `req.isImpersonation` and can limit exposure.
 */
export const startImpersonation = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.validatedBody;

  // 2FA check is now handled by require2fa middleware

  const tenant = await Tenant.findById(tenantId).select('name status isActive');
  if (!tenant) throw ApiError.notFound('Tenant not found');
  if (!tenant.isActive || tenant.status === 'suspended' || tenant.status === 'archived') {
    throw ApiError.badRequest('Tenant is not active');
  }

  const user = await User.findOne({ _id: userId, tenant: tenantId }).populate('branch', 'name');
  if (!user || !user.isActive) {
    throw ApiError.notFound('User not found or inactive in this tenant');
  }

  // H7: role-cap the impersonation target. A support/admin session must never
  // impersonate a clinic owner (or any super-admin-like user), which would
  // grant it owner-level permissions inside the clinic. Only super_admin may
  // impersonate the tenant's owner.
  const userRole = user.roleId
    ? await Role.findById(user.roleId).select('key isSystemAdmin isBuiltIn').lean()
    : null;
  const targetIsOwner = userRole?.isSystemAdmin || userRole?.key === 'clinic_admin' || userRole?.key === 'super_admin';
  if (targetIsOwner && req.siteAdmin?.role !== 'super_admin') {
    throw ApiError.forbidden('Only super_admin can impersonate the clinic owner');
  }

  const impersonationToken = jwt.sign(
    {
      sub: user._id.toString(),
      roleId: user.roleId ? user.roleId.toString() : null,
      branch: user.branch?._id?.toString() || null,
      tenant: tenant._id.toString(),
      type: 'impersonation',
      impersonator: req.siteAdmin._id.toString(),
      impersonatorName: req.siteAdmin.name,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30m' },
  );

  req.auditTargetName = `${tenant.name} / ${user.name}`;
  req.auditDetails = { userId: user._id.toString(), tenantId: tenant._id.toString() };

  return sendSuccess(res, {
    impersonationToken,
    expiresIn: '30m',
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      branch: user.branch ? { _id: user.branch._id, name: user.branch.name } : null,
      tenant: { _id: tenant._id, name: tenant.name },
    },
    warning: 'You are now acting on behalf of this user. All actions are logged.',
  });
});

/**
 * POST /site/impersonation/end
 * Log the end of an impersonation session.
 *
 * H7: revoking a token must be scoped. The caller supplies the impersonation
 * token they hold; it is only honoured when that token was issued to THIS site
 * admin (impersonator claim matches). A generic `userId` can no longer be used
 * to bump an arbitrary clinic user's tokenVersion and log them out.
 */
export const endImpersonation = asyncHandler(async (req, res) => {
  const { impersonationToken } = req.body || {};

  if (!impersonationToken) {
    throw ApiError.badRequest('impersonationToken is required to end impersonation');
  }

  let decoded;
  try {
    decoded = jwt.verify(impersonationToken, process.env.JWT_SECRET);
  } catch {
    throw ApiError.badRequest('Invalid or expired impersonation token');
  }

  if (decoded.type !== 'impersonation') {
    throw ApiError.badRequest('Not an impersonation token');
  }

  let targetUserId = null;
  if (String(decoded.impersonator) === String(req.siteAdmin._id)) {
    targetUserId = decoded.sub;
    await User.findByIdAndUpdate(targetUserId, { $inc: { tokenVersion: 1 } });
  }

  req.auditTargetName = targetUserId ? String(targetUserId) : '';
  req.auditDetails = { action: 'impersonation.end', userId: targetUserId ? String(targetUserId) : null };
  return sendSuccess(res, { message: 'Impersonation session ended' });
});
