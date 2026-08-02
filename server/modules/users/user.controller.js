import mongoose from 'mongoose';

import Branch from './branch.model.js';
import Role from './role.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import User from './user.model.js';
import { currentTenant, filterByBranch, toObjectId } from '../../utils/branchScope.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { invalidatePermission } from '../../utils/cache.js';
import { emitToBranch } from '../../socket/index.js';

const POPULATE = [
  { path: 'branch', select: 'name address phone isActive' },
  { path: 'roleId', select: 'name key isSystemAdmin isBuiltIn permissions' },
];

/**
 * POST /api/users
 * Create a staff member. The clinic owner (super_admin with a tenant) can
 * create employees within their own clinic. Platform admin (no tenant) can
 * create users in any branch.
 *
 * Rules:
 * - Only the clinic owner role (super_admin) can be the creator.
 * - Employees cannot be assigned super_admin (only the clinic owner holds it).
 * - The tenant is stamped from the creator's tenant.
 * - Branch is validated to belong to the same tenant.
 * - Plan limit on maxDoctors is enforced when creating doctor-role users.
 */
export const createUser = asyncHandler(async (req, res) => {
  const data = req.validatedBody;
  const tenant = currentTenant(req);

  // Validate roleId — must exist and belong to same tenant.
  const roleDoc = await Role.findById(data.roleId);
  if (!roleDoc) {
    throw ApiError.badRequest('Referenced role does not exist', { roleId: 'not found' });
  }
  if (tenant && String(roleDoc.tenant || '') !== String(tenant)) {
    throw ApiError.badRequest('Role does not belong to your clinic', { roleId: 'tenant mismatch' });
  }

  // Resolve branch: clinic owner must assign to a branch within their tenant.
  let branchId;
  const creatorIsPlatform = req._roleResolved?.isSystemAdmin && !tenant;
  if (creatorIsPlatform) {
    // Platform admin: branch must be provided explicitly.
    if (!data.branch) {
      throw ApiError.badRequest('branch is required', { branch: 'branch is required' });
    }
    branchId = toObjectId(data.branch);
  } else {
    // Clinic owner: use provided branch or their own.
    branchId = data.branch ? toObjectId(data.branch) : toObjectId(req.user.branch);
  }

  // Validate the branch belongs to the same tenant and is active (for clinic owners).
  if (tenant) {
    const branch = await Branch.findOne({ _id: branchId, tenant, isActive: true });
    if (!branch) {
      throw ApiError.badRequest('The selected branch does not belong to your clinic or is inactive', {
        branch: 'not found or inactive',
      });
    }
  } else {
    const branch = await Branch.findOne({ _id: branchId, isActive: true });
    if (!branch) {
      throw ApiError.badRequest('Referenced branch does not exist or is inactive', { branch: 'not found or inactive' });
    }
  }

  // Email uniqueness within tenant
  const emailFilter = { email: data.email };
  if (tenant) emailFilter.tenant = tenant;
  const existing = await User.findOne(emailFilter);
  if (existing) {
    throw ApiError.conflict('A user with this email already exists in this clinic');
  }

  // Plan limit: enforce maxDoctors when creating a doctor.
  if (data.isDoctor && tenant) {
    const tenantDoc = await Tenant.findById(tenant).select('settings');
    const doctorCount = await User.countDocuments({ tenant, isDoctor: true });
    const maxDoctors = tenantDoc?.settings?.maxDoctors ?? 999;
    if (doctorCount >= maxDoctors) {
      throw ApiError.conflict(
        `Your plan allows a maximum of ${maxDoctors} doctors. Upgrade your plan to add more.`,
      );
    }
  }

  const user = await User.create({
    ...data,
    branch: branchId,
    tenant,
  });
  await user.populate(POPULATE);

  emitToBranch(String(branchId), 'user:created', { user: user.toSafeObject() });
  return sendSuccess(res, { user: user.toSafeObject() }, 201);
});

/**
 * GET /api/users
 * List staff. Clinic owner sees only their own tenant's users. Platform admin
 * sees all (with optional ?roleId / ?branch filters).
 */
export const listUsers = asyncHandler(async (req, res) => {
  const filter = { ...filterByBranch(req) };

  // Tenant isolation: clinic owners only see their own staff.
  const tenant = currentTenant(req);
  if (tenant) {
    filter.tenant = tenant;
  }

  const { roleId, isDoctor, branch } = req.validatedQuery || {};
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  if (roleId) filter.roleId = toObjectId(roleId);
  if (isDoctor === 'true') {
    filter.isDoctor = true;
  }
  if (branch) filter.branch = toObjectId(branch);

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate(POPULATE)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    users: users.map((u) => u.toSafeObject()),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * GET /api/users/doctors
 * Lightweight endpoint — only requires appointments:create permission (since the
 * doctor list is needed when booking an appointment). Separate from the main
 * users list so receptionists/doctors don't need full users:read.
 */
export const listDoctors = asyncHandler(async (req, res) => {
  const filter = { ...filterByBranch(req) };
  const tenant = currentTenant(req);
  if (tenant) filter.tenant = tenant;
  filter.isDoctor = true;

  const users = await User.find(filter)
    .select('name email roleId isDoctor branch')
    .sort('name')
    .limit(200);

  return sendSuccess(res, { doctors: users.map((u) => u.toSafeObject()) });
});

/**
 * GET /api/users/:id
 */
export const getUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid user id');
  }
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const user = await User.findOne(filter).populate(POPULATE);
  if (!user) throw ApiError.notFound('User not found');
  return sendSuccess(res, { user: user.toSafeObject() });
});

/**
 * PATCH /api/users/:id
 * Update a staff member. Cannot change tenant.
 */
export const updateUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid user id');
  }
  const data = req.validatedBody;
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const user = await User.findOne(filter);
  if (!user) throw ApiError.notFound('User not found');

  // Prevent self-deactivation
  if (data.isActive === false && String(user._id) === String(req.user._id)) {
    throw ApiError.forbidden('Cannot deactivate your own account');
  }

  // Prevent changing to a system admin role
  if (data.roleId) {
    const targetRole = await Role.findById(data.roleId).select('isSystemAdmin isBuiltIn');
    if (targetRole?.isSystemAdmin) {
      throw ApiError.forbidden('Cannot assign a system admin role through this endpoint');
    }
  }

  // Email uniqueness check within tenant
  if (data.email && data.email !== user.email) {
    const emailFilter = { email: data.email, _id: { $ne: user._id } };
    if (tenant) emailFilter.tenant = tenant;
    const existing = await User.findOne(emailFilter);
    if (existing) {
      throw ApiError.conflict('A user with this email already exists in this clinic');
    }
  }

  // Validate branch belongs to same tenant
  if (data.branch) {
    const branchId = toObjectId(data.branch);
    if (tenant) {
      const branch = await Branch.findOne({ _id: branchId, tenant, isActive: true });
      if (!branch) throw ApiError.badRequest('The selected branch is not available');
    }
    data.branch = branchId;
  }

  // Validate roleId belongs to same tenant
  if (data.roleId) {
    const roleDoc = await Role.findById(data.roleId);
    if (!roleDoc) throw ApiError.badRequest('Referenced role does not exist');
    if (tenant && String(roleDoc.tenant || '') !== String(tenant)) {
      throw ApiError.badRequest('Role does not belong to your clinic', { roleId: 'tenant mismatch' });
    }
  }

  if (data.name !== undefined) user.name = data.name;
  if (data.email !== undefined) user.email = data.email;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.roleId !== undefined) user.roleId = data.roleId;
  if (data.branch !== undefined) user.branch = toObjectId(data.branch);
  if (data.isActive !== undefined) user.isActive = data.isActive;
  if (data.isDoctor !== undefined) user.isDoctor = data.isDoctor;
  if (data.commissionRate !== undefined) user.commissionRate = data.commissionRate;
  if (data.password) {
    user.password = data.password;
    // Revoke every existing session (access + refresh + socket tokens all carry
    // tokenVersion) so old sessions die once the password changes.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
  }

  await user.save();
  await user.populate(POPULATE);

  // Invalidate cached permissions for this user so next request picks up the new role
  if (data.roleId !== undefined) {
    await invalidatePermission(String(user._id), user.roleId ? String(user.roleId) : '');
  }

  emitToBranch(String(user.branch?._id ?? user.branch), 'user:updated', { user: user.toSafeObject() });
  return sendSuccess(res, { user: user.toSafeObject() });
});

/**
 * DELETE /api/users/:id
 * Soft-delete (deactivate).
 */
export const deleteUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid user id');
  }
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const user = await User.findOne(filter);
  if (!user) throw ApiError.notFound('User not found');
  if (String(user._id) === String(req.user._id)) {
    throw ApiError.forbidden('Cannot deactivate your own account');
  }
  user.isActive = false;
  await user.save();
  emitToBranch(String(user.branch), 'user:deleted', { _id: user._id });
  return sendSuccess(res, { message: 'User deactivated' });
});

/**
 * PATCH /api/users/:id/toggle-active
 * Toggle isActive status (activate / deactivate).
 */
export const toggleUserActive = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw ApiError.badRequest('Invalid user id');
  }
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const user = await User.findOne(filter);
  if (!user) throw ApiError.notFound('User not found');
  if (user.isActive && String(user._id) === String(req.user._id)) {
    throw ApiError.forbidden('Cannot deactivate your own account');
  }
  user.isActive = !user.isActive;
  await user.save();
  await user.populate(POPULATE);
  emitToBranch(String(user.branch?._id ?? user.branch), 'user:toggled', { user: user.toSafeObject() });
  return sendSuccess(res, { user: user.toSafeObject() });
});
