import Tenant from '../tenant/tenant.model.js';
import ApiError from '../../../utils/ApiError.js';
import { cacheGet, cacheSet, cacheDel, invalidateTenant } from '../../../utils/cache.js';

const AVAILABLE_MODULES = [
  'dashboard', 'patients', 'appointments', 'billing',
  'accounting', 'emr', 'prescriptions', 'users',
  'branches', 'inventory', 'roles', 'settings',
  'chat', 'search',
];

export async function getTenantModules(tenantId) {
  let tenant = await cacheGet('modules', tenantId);
  if (!tenant) {
    tenant = await Tenant.findById(tenantId).select('planModules plan').lean();
    if (!tenant) throw ApiError.notFound('Tenant not found');
    await cacheSet('modules', tenantId, tenant, 300);
  }

  return {
    tenantId: tenant._id,
    plan: tenant.plan,
    enabledModules: tenant.planModules || [],
    availableModules: AVAILABLE_MODULES,
  };
}

export async function toggleModule(tenantId, { module, enabled }) {
  if (!AVAILABLE_MODULES.includes(module)) {
    throw ApiError.badRequest(`Invalid module. Must be one of: ${AVAILABLE_MODULES.join(', ')}`);
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  if (enabled) {
    if (!tenant.planModules.includes(module)) {
      tenant.planModules.push(module);
    }
  } else {
    tenant.planModules = tenant.planModules.filter((m) => m !== module);
  }

  await tenant.save();
  await cacheDel('modules', tenantId);
  await invalidateTenant(String(tenantId));

  return { tenantId: tenant._id, enabledModules: tenant.planModules, tenantName: tenant.name };
}

export async function setModules(tenantId, { modules }) {
  const invalid = modules.filter((m) => !AVAILABLE_MODULES.includes(m));
  if (invalid.length > 0) {
    throw ApiError.badRequest(`Invalid modules: ${invalid.join(', ')}`);
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  tenant.planModules = modules;
  await tenant.save();
  await cacheDel('modules', tenantId);
  await invalidateTenant(String(tenantId));

  return { tenantId: tenant._id, enabledModules: tenant.planModules, tenantName: tenant.name };
}
