import User from '../users/user.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import ApiError from '../../utils/ApiError.js';
import {
  assertNotLocked,
  recordFailedLogin,
  resetFailedLogins,
} from '../../utils/loginThrottle.js';

export async function assertTenantActive(tenantId) {
  if (!tenantId) return;
  const tenant = await Tenant.findById(tenantId).select('status isActive');
  if (!tenant) {
    throw ApiError.forbidden('Your clinic account no longer exists');
  }
  if (!tenant.isActive || tenant.status === 'suspended' || tenant.status === 'cancelled') {
    throw ApiError.forbidden('Your clinic subscription is suspended. Contact your platform administrator.');
  }
}

export async function authenticateUser(emailOrUsername, password) {
  const identifier = String(emailOrUsername || '').trim().toLowerCase();
  await assertNotLocked(identifier);

  // PRD §6.1: login accepts either the email address or the username.
  const matches = await User.find({
    $or: [{ email: identifier }, { username: identifier }],
  })
    .select('+password')
    .populate('branch');

  // The same email can legitimately exist in two different clinics, and
  // findOne() would then return an arbitrary one — either signing the user into
  // the WRONG tenant, or reporting "Invalid email or password" for credentials
  // that are in fact valid. Refuse to guess when the identifier is ambiguous;
  // this only triggers for genuinely duplicated accounts.
  const tenants = [...new Set(matches.map((u) => String(u.tenant)).filter(Boolean))];
  if (tenants.length > 1) {
    throw ApiError.conflict(
      'This account exists in more than one clinic. Please sign in from your clinic page or contact your administrator.',
    );
  }

  const user = matches[0];
  if (!user) {
    // No lockout state for unknown accounts (avoids lockout-DoS via account
    // enumeration); the per-IP/per-account rate limiters still apply.
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('Account is disabled');
  }
  const ok = await user.comparePassword(password);
  if (!ok) {
    await recordFailedLogin(identifier);
    throw ApiError.unauthorized('Invalid email or password');
  }
  await resetFailedLogins(identifier);
  await assertTenantActive(user.tenant);
  return user;
}

export async function getUserWithTenant(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) return null;
  return user;
}

export async function getUserWithTenantInfo(userObj) {
  if (userObj.tenant) {
    const tenant = await Tenant.findById(userObj.tenant).select('status isActive name plan planModules').lean();
    if (tenant) {
      userObj.tenant = {
        _id: tenant._id,
        name: tenant.name,
        status: tenant.status,
        isActive: tenant.isActive,
        plan: tenant.plan,
        // planModules lets the client hide/disable UI for features that the
        // tenant's plan does not include (e.g. no chat sidebar polling).
        planModules: tenant.planModules || [],
      };
    }
  }
  return userObj;
}
