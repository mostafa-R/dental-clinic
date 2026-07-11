import jwt from 'jsonwebtoken';
import User from "../../users/user.model.js";
import Tenant from "../tenant/tenant.model.js";
import ApiError from "../../../utils/ApiError.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";

/**
 * POST /site/impersonation/start
 * Generate a clinic-user token for the requesting site admin so they can
 * temporarily act as a specific clinic user for support purposes.
 *
 * Security measures:
 * - Only super_admin / admin roles can impersonate.
 * - The impersonation session is logged in AuditLog.
 * - The generated token is short-lived (30 min).
 * - PHI-sensitive routes check `req.isImpersonation` and can limit exposure.
 */
export const startImpersonation = asyncHandler(async (req, res) => {
  const { userId, tenantId } = req.validatedBody;

  if (!req.siteAdmin.twoFactorEnabled) {
    throw ApiError.forbidden('Two-factor authentication must be enabled to use impersonation');
  }

  const tenant = await Tenant.findById(tenantId).select('name status isActive');
  if (!tenant) throw ApiError.notFound('Tenant not found');
  if (!tenant.isActive || tenant.status === 'suspended' || tenant.status === 'archived') {
    throw ApiError.badRequest('Tenant is not active');
  }

  const user = await User.findOne({ _id: userId, tenant: tenantId }).populate('branch', 'name');
  if (!user || !user.isActive) {
    throw ApiError.notFound('User not found or inactive in this tenant');
  }

  const impersonationToken = jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
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
      role: user.role,
      branch: user.branch ? { _id: user.branch._id, name: user.branch.name } : null,
      tenant: { _id: tenant._id, name: tenant.name },
    },
    warning: 'You are now acting on behalf of this user. All actions are logged.',
  });
});

/**
 * POST /site/impersonation/end
 * Log the end of an impersonation session.
 */
export const endImpersonation = asyncHandler(async (req, res) => {
  req.auditDetails = { action: 'impersonation.end' };
  return sendSuccess(res, { message: 'Impersonation session ended' });
});
