import Tenant from '../tenant/tenant.model.js';
import ApiError from '../../../utils/ApiError.js';
import { cacheGet, cacheSet, cacheDel, invalidateTenant } from '../../../utils/cache.js';
import { MODULE_KEYS } from '../../../constants/permissions.js';

// Canonical module list — single source of truth is
// server/constants/permissions.js so plans, roles and feature flags never drift.
const AVAILABLE_MODULES = MODULE_KEYS;

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
    // Legacy keys (e.g. `search`) may still be stored on old tenants:
    // allow disabling them for cleanup, but never re-enabling.
    if (enabled) {
      throw ApiError.badRequest(`Invalid module. Must be one of: ${AVAILABLE_MODULES.join(', ')}`);
    }
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
