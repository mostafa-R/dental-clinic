import User from '../modules/users/user.model.js';
import ApiError from '../utils/ApiError.js';
import { cacheTenant, getCachedTenant } from '../utils/cache.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../utils/jwt.js';

/**
 * Authentication middleware for clinic users.
 *
 * Flow:
 *   1. Extract JWT from httpOnly cookie
 *   2. Verify token signature and expiry
 *   3. Load user from DB (with populated branch + tenant)
 *   4. Validate token version (revoke on password change)
 *   5. Check tenant subscription status (cached in Redis)
 *   6. Attach user to req.user
 */
export async function protect(req, _res, next) {
  try {
    const token = req.cookies?.[ACCESS_COOKIE];
    if (!token) {
      throw ApiError.unauthorized('Not authenticated');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token');
    }

    // NOTE: role is intentionally NOT populated here — RBAC resolution happens
    // lazily in middleware/checkPermission.js resolveRole() (Redis-cached,
    // tenant-scoped). Populating it here would double-query on every request.
    const user = await User.findById(decoded.sub)
      .populate('branch', 'name address phone isActive')
      .populate('tenant', 'plan planModules planId status name isActive subscriptionEndsAt');
    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }
    if (!user.isActive) {
      throw ApiError.forbidden('Account is disabled');
    }

    // Deactivated branches must not serve requests — users assigned to one
    // would otherwise keep full access after the branch is archived.
    if (user.branch && user.branch.isActive === false) {
      throw ApiError.forbidden('Your branch has been deactivated. Contact your administrator.');
    }

    // Reject revoked tokens (password change, admin-initiated rotation).
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      throw ApiError.unauthorized('Token revoked — please log in again');
    }

    // Enforce tenant subscription status on every protected request.
    const rawTenantId = user._doc?.tenant;
    if (rawTenantId && (!user.tenant || !user.tenant._id)) {
      throw ApiError.forbidden('Your clinic no longer exists. Contact your platform administrator.');
    }

    if (user.tenant) {
      const tenantId = String(user.tenant._id);

      // Try cache first, then DB, then cache the result
      let tenantConfig = await getCachedTenant(tenantId);
      if (!tenantConfig) {
        tenantConfig = {
          _id: user.tenant._id,
          plan: user.tenant.plan,
          planModules: user.tenant.planModules,
          planId: user.tenant.planId,
          status: user.tenant.status,
          name: user.tenant.name,
          isActive: user.tenant.isActive,
          subscriptionEndsAt: user.tenant.subscriptionEndsAt,
        };
        await cacheTenant(tenantId, tenantConfig);
      }

      // Quick subscription check from cache. `archived` tenants are rejected
      // the same as suspended/cancelled — a clinic marked archived is
      // permanently read-only for its users.
      if (!tenantConfig.isActive || ['suspended', 'cancelled', 'archived'].includes(tenantConfig.status)) {
        throw ApiError.forbidden('Your clinic subscription is suspended. Contact your platform administrator.');
      }

      // Replace the populated tenant with the cached config for downstream use
      user.tenant = tenantConfig;
    }

    req.user = user.toObject();
    delete req.user.password;
    delete req.user.refreshToken;
    delete req.user.tokenVersion;
    delete req.user.__v;

    // Propagate impersonation context so downstream middleware can restrict PHI.
    if (decoded.type === 'impersonation') {
      req.user._impersonating = true;
      req.user._impersonator = decoded.impersonator;
    }

    return next();
  } catch (err) {
    return next(err);
  }
}
