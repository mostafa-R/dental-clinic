import User from '../users/user.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import ApiError from '../../utils/ApiError.js';

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

export async function authenticateUser(email, password) {
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
  await assertTenantActive(user.tenant);
  return user;
}

export async function refreshUser(tokenData, currentTokenVersion) {
  if (tokenData.tokenVersion !== undefined && tokenData.tokenVersion !== currentTokenVersion) {
    throw ApiError.unauthorized('Token has been rotated, please log in again');
  }
}

export async function getUserWithTenant(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) return null;
  return user;
}

export async function getUserWithTenantInfo(userObj) {
  if (userObj.tenant) {
    const tenant = await Tenant.findById(userObj.tenant).select('status isActive name').lean();
    if (tenant) {
      userObj.tenant = {
        _id: tenant._id,
        name: tenant.name,
        status: tenant.status,
        isActive: tenant.isActive,
      };
    }
  }
  return userObj;
}
