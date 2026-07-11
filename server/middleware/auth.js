import ApiError from '../utils/ApiError.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../utils/jwt.js';
import User from '../modules/users/user.model.js';

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

    const user = await User.findById(decoded.sub)
      .populate('branch', 'name address phone isActive')
      .populate('tenant', 'plan planModules planId status name isActive');
    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }
    if (!user.isActive) {
      throw ApiError.forbidden('Account is disabled');
    }

    // Reject revoked tokens (password change, admin-initiated rotation).
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      throw ApiError.unauthorized('Token revoked — please log in again');
    }

    // Enforce tenant subscription status on every protected request.
    // Check if the user has a tenant ID but the populate returned null (deleted tenant).
    const rawTenantId = user._doc?.tenant;
    if (rawTenantId && (!user.tenant || !user.tenant._id)) {
      throw ApiError.forbidden('Your clinic no longer exists. Contact your platform administrator.');
    }
    if (user.tenant) {
      const tenant = user.tenant;
      if (!tenant.isActive || tenant.status === 'suspended' || tenant.status === 'cancelled') {
        throw ApiError.forbidden('Your clinic subscription is suspended. Contact your platform administrator.');
      }
    }

    req.user = user.toObject();
    delete req.user.password;
    delete req.user.refreshToken;

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


