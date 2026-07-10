import Tenant from '../models/Tenant.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/sendSuccess.js';
import { cacheGet, cacheSet } from '../config/redis.js';

const AVAILABLE_MODULES = [
  'dashboard', 'patients', 'appointments', 'billing',
  'accounting', 'emr', 'prescriptions', 'users',
  'branches', 'inventory', 'roles', 'settings',
];

export const getTenantModules = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const cacheKey = `modules:${tenantId}`;
  let tenant = await cacheGet(cacheKey);
  if (!tenant) {
    tenant = await Tenant.findById(tenantId).select('planModules plan').lean();
    if (!tenant) throw ApiError.notFound('Tenant not found');
    await cacheSet(cacheKey, tenant, 300);
  }

  return sendSuccess(res, {
    tenantId: tenant._id,
    plan: tenant.plan,
    enabledModules: tenant.planModules || [],
    availableModules: AVAILABLE_MODULES,
  });
});

export const toggleModule = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { module, enabled } = req.validatedBody;

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

  req.auditTargetName = tenant.name;
  req.auditDetails = { module, enabled };
  await cacheSet(`modules:${tenantId}`, null, 1);

  return sendSuccess(res, {
    tenantId: tenant._id,
    enabledModules: tenant.planModules,
  });
});

export const setModules = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { modules } = req.validatedBody;

  const invalid = modules.filter((m) => !AVAILABLE_MODULES.includes(m));
  if (invalid.length > 0) {
    throw ApiError.badRequest(`Invalid modules: ${invalid.join(', ')}`);
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  tenant.planModules = modules;
  await tenant.save();

  req.auditTargetName = tenant.name;
  req.auditDetails = { modules };
  await cacheSet(`modules:${tenantId}`, null, 1);

  return sendSuccess(res, {
    tenantId: tenant._id,
    enabledModules: tenant.planModules,
  });
});
