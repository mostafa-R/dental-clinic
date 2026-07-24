import mongoose from 'mongoose';

import Role from './role.model.js';
import User from './user.model.js';
import { currentTenant, filterByBranch, toObjectId, resolveBranchForCreate } from '../../utils/branchScope.js';
import { MODULES, CRUD_ACTIONS } from '../../constants/permissions.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { invalidateRole, invalidateTenantRoles, invalidatePermission } from '../../utils/cache.js';
import { emitToBranch } from '../../socket/index.js';

/**
 * GET /api/roles
 * List all roles for the current tenant (or platform-level if no tenant).
 */
export const listRoles = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);

  const filter = { ...filterByBranch(req) };
  if (tenant) {
    filter.$or = [{ tenant }, { tenant: null }];
  }
  filter.isActive = { $ne: false };
  const roles = await Role.find(filter).sort('isBuiltIn -createdAt');

  return sendSuccess(res, { roles, modules: MODULES, actions: CRUD_ACTIONS });
});

/**
 * GET /api/roles/:id
 */
export const getRole = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid role id');
  }
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const role = await Role.findOne(filter);
  if (!role) {
    throw ApiError.notFound('Role not found');
  }
  return sendSuccess(res, { role });
});

/**
 * POST /api/roles
 * Create a custom role with a permission matrix.
 */
export const createRole = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const { name, description, permissions } = req.validatedBody;

  // Resolve branch: system admins must provide one; others get their own.
  let branchId = null;
  if (req.body.branch || !tenant) {
    try {
      branchId = await resolveBranchForCreate(req, req.body.branch);
    } catch (err) {
      // Only swallow for platform admins (no tenant) without explicit branch
      if (tenant || req.body.branch) throw err;
    }
  } else if (req.user.branch) {
    branchId = toObjectId(req.user.branch);
  }

  // Check name uniqueness within the tenant + branch scope.
  const existingQuery = { name };
  if (tenant) existingQuery.tenant = tenant;
  else existingQuery.tenant = null;
  if (branchId) existingQuery.branch = branchId;
  const existing = await Role.findOne(existingQuery);
  if (existing) {
    throw ApiError.conflict('A role with this name already exists');
  }

  const role = await Role.create({
    tenant,
    branch: branchId,
    name,
    description: description || '',
    permissions: permissions || [],
    isBuiltIn: false,
    isSystemAdmin: false,
  });

  emitToBranch(String(branchId || tenant || ''), 'role:created', { role });
  return sendSuccess(res, { role }, 201);
});

/**
 * PATCH /api/roles/:id
 * Update a role's name, description, or permission matrix.
 * Built-in roles cannot be renamed or deleted, but their permissions CAN be
 * edited (clinic admin customizes what each built-in role can do).
 */
export const updateRole = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid role id');
  }
  const data = req.validatedBody;
  const tenant = currentTenant(req);

  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const role = await Role.findOne(filter);
  if (!role) {
    throw ApiError.notFound('Role not found');
  }

  // Built-in roles can have their permissions edited but not renamed.
  if (role.isBuiltIn && data.name && data.name !== role.name) {
    throw ApiError.conflict('Built-in role names cannot be changed');
  }

  if (data.name !== undefined && !role.isBuiltIn) role.name = data.name;
  if (data.description !== undefined) role.description = data.description;
  if (data.permissions !== undefined) role.permissions = data.permissions;
  if (data.isActive !== undefined) role.isActive = data.isActive;

  await role.save();

  // Invalidate cached role and all permissions that depend on it
  await invalidateRole(String(role._id));
  if (tenant) await invalidateTenantRoles(String(tenant));

  emitToBranch(String(role.branch || role.tenant || ''), 'role:updated', { role });
  return sendSuccess(res, { role });
});

/**
 * DELETE /api/roles/:id
 * Only custom (non-built-in) roles can be deleted. Users assigned to a deleted
 * role keep their role key string on the User document but will fall back to
 * built-in default permissions.
 */
export const deleteRole = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid role id');
  }
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const role = await Role.findOne(filter);
  if (!role) {
    throw ApiError.notFound('Role not found');
  }
  if (role.isBuiltIn) {
    throw ApiError.conflict('Built-in roles cannot be deleted');
  }

  const roleId = String(role._id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await User.updateMany({ roleId: role._id }, { $set: { roleId: null } }, { session });
      await role.deleteOne({ session });
    });
  } finally {
    session.endSession();
  }

  // Invalidate cached role and tenant roles
  await invalidateRole(roleId);
  if (tenant) await invalidateTenantRoles(String(tenant));

  emitToBranch(String(role.branch || role.tenant || ''), 'role:deleted', { _id: role._id });
  return sendSuccess(res, { message: 'Role deleted' });
});

/**
 * GET /api/roles/modules/list
 * Returns the full module + action catalog for the permission matrix UI.
 */
export const getModules = asyncHandler(async (_req, res) => {
  return sendSuccess(res, { modules: MODULES, actions: CRUD_ACTIONS });
});
