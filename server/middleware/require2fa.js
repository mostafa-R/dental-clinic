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
 * Default maximum age of the `twoFactorVerifiedAt` claim before a session
 * must re-authenticate through a fresh 2FA challenge. Configurable via the
 * `SITE_2FA_MAX_AGE_SECONDS` env var or per-route via `options.maxAgeSeconds`.
 */
export const DEFAULT_2FA_MAX_AGE_SECONDS = 15 * 60; // 15 minutes

function maxAgeSecondsFromEnv() {
  const raw = Number(process.env.SITE_2FA_MAX_AGE_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_2FA_MAX_AGE_SECONDS;
}

function logBlocked(req, event, extra = {}) {
  console.warn({
    event,
    adminId: String(req.siteAdmin?._id ?? ''),
    adminEmail: req.siteAdmin?.email,
    adminRole: req.siteAdmin?.role,
    endpoint: req.originalUrl,
    method: req.method,
    ip: req.ip || req.connection?.remoteAddress,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

/**
 * Middleware to enforce 2FA for sensitive operations.
 *
 * Blocks sensitive writes (backups, tenant delete/suspend, impersonation) for
 * super_admin/admin roles unless the current session can prove it completed a
 * 2FA challenge recently. Merely having `twoFactorEnabled` on the account is
 * not enough: the `site_access` token must carry `twoFactorVerified: true` and
 * a `twoFactorVerifiedAt` timestamp that is no older than `maxAgeSeconds`.
 *
 * Usage:
 *   router.post('/backup', require2faForSensitiveOps, triggerBackup);
 *   router.delete('/tenant/:id', require2faForSensitiveOps, deleteTenant);
 *   // Stricter window for the most destructive operations:
 *   router.delete('/tenant/:id', require2faForSensitiveOps(['super_admin'], { maxAgeSeconds: 300 }), deleteTenant);
 *
 * @param {string[]} roles - Roles that require 2FA (default: ['super_admin', 'admin'])
 * @param {{ maxAgeSeconds?: number }} [options] - Freshness window for the
 *   `twoFactorVerifiedAt` claim (default: `SITE_2FA_MAX_AGE_SECONDS` or 15 min).
 * @returns {function} Express middleware
 */
export function require2faForSensitiveOps(roles = ['super_admin', 'admin'], options = {}) {
  const maxAgeSeconds = options.maxAgeSeconds ?? maxAgeSecondsFromEnv();
  const maxAgeMs = maxAgeSeconds * 1000;

  return function require2faMiddleware(req, _res, next) {
    if (!req.siteAdmin) {
      return next(ApiError.unauthorized('Not authenticated'));
    }

    // Only check 2FA for specified roles
    if (!roles.includes(req.siteAdmin.role)) {
      return next();
    }

    // The access token must prove this session completed a 2FA challenge.
    // Requiring the claims (not just the config flag) means a session that was
    // created before 2FA was enabled, or a stolen cookie, cannot perform
    // sensitive operations without re-authenticating through 2FA.
    const claims = req.siteTokenClaims || {};
    const verifiedAt = claims.twoFactorVerifiedAt;
    const ageMs =
      claims.twoFactorVerified === true && typeof verifiedAt === 'number'
        ? Date.now() - verifiedAt
        : null;

    if (ageMs === null || ageMs < 0) {
      logBlocked(req, 'SENSITIVE_OPERATION_BLOCKED_2FA_NOT_VERIFIED');
      return next(ApiError.forbidden(
        'Two-factor verification is required for this operation. ' +
        'Please log in again and complete two-factor authentication.'
      ));
    }

    // Enforce freshness: even a verified session must re-confirm its identity
    // for sensitive operations after `maxAgeSeconds` have elapsed.
    if (ageMs > maxAgeMs) {
      logBlocked(req, 'SENSITIVE_OPERATION_BLOCKED_2FA_STALE', {
        verifiedAt: new Date(verifiedAt).toISOString(),
        maxAgeSeconds,
      });
      return next(ApiError.forbidden(
        'Two-factor verification has expired for this operation. ' +
        'Please log in again and complete two-factor authentication.'
      ));
    }

    // Check if 2FA is enabled
    if (!req.siteAdmin.twoFactorEnabled) {
      logBlocked(req, 'SENSITIVE_OPERATION_BLOCKED_2FA_REQUIRED');
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
