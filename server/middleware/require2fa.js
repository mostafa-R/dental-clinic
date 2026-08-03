import jwt from 'jsonwebtoken';
import SiteAdmin from '../modules/site/admin/admin.model.js';
import ApiError from '../utils/ApiError.js';

/**
 * Middleware to verify 2FA challenge token and complete login.
 * Used in the 2FA verification endpoint.
 */
export async function require2faChallenge(req, _res, next) {
  try {
    const { challengeToken } = req.validatedBody;
    if (!challengeToken) {
      throw ApiError.unauthorized('2FA challenge token is required');
    }

    let decoded;
    try {
      decoded = jwt.verify(challengeToken, process.env.JWT_2FA_SECRET || process.env.JWT_SECRET);
    } catch {
      throw ApiError.unauthorized('Invalid or expired challenge token');
    }

    if (decoded.type !== '2fa_challenge') {
      throw ApiError.unauthorized('Invalid token type');
    }

    const admin = await SiteAdmin.findById(decoded.sub);
    if (!admin || !admin.isActive) {
      throw ApiError.unauthorized('Admin not found or disabled');
    }

    req._2faAdmin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware to enforce 2FA for sensitive operations.
 * 
 * Blocks sensitive writes (backups, tenant delete/suspend, impersonation)
 * when twoFactorEnabled is false for super_admin/admin roles.
 * 
 * Usage:
 *   router.post('/backup', require2faForSensitiveOps, triggerBackup);
 *   router.delete('/tenant/:id', require2faForSensitiveOps, deleteTenant);
 * 
 * @param {string[]} roles - Roles that require 2FA (default: ['super_admin', 'admin'])
 * @returns {function} Express middleware
 */
export function require2faForSensitiveOps(roles = ['super_admin', 'admin']) {
  return function require2faMiddleware(req, _res, next) {
    if (!req.siteAdmin) {
      return next(ApiError.unauthorized('Not authenticated'));
    }

    // Normalize role (site_admin is treated as super_admin)
    const effectiveRole = req.siteAdmin.role === 'site_admin' ? 'super_admin' : req.siteAdmin.role;

    // Only check 2FA for specified roles
    if (!roles.includes(effectiveRole)) {
      return next();
    }

    // Check if 2FA is enabled
    if (!req.siteAdmin.twoFactorEnabled) {
      // Log the blocked attempt
      console.warn({
        event: 'SENSITIVE_OPERATION_BLOCKED_2FA_REQUIRED',
        adminId: String(req.siteAdmin._id),
        adminEmail: req.siteAdmin.email,
        adminRole: req.siteAdmin.role,
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip || req.connection?.remoteAddress,
        timestamp: new Date().toISOString()
      });

      return next(ApiError.forbidden(
        'Two-factor authentication must be enabled to perform this sensitive operation. ' +
        'Please enable 2FA in your account settings.'
      ));
    }

    next();
  };
}

/**
 * Pre-configured middleware for the most sensitive operations.
 * Requires 2FA for super_admin and admin roles.
 */
export const require2fa = require2faForSensitiveOps(['super_admin', 'admin']);

/**
 * Pre-configured middleware for super-admin-only sensitive operations.
 * Requires 2FA only for super_admin role.
 */
export const require2faSuperAdmin = require2faForSensitiveOps(['super_admin']);
