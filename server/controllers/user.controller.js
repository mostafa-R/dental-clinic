import Branch from '../models/Branch.js';
import Role from '../models/Role.js';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import { currentTenant, filterByBranch, toObjectId } from '../utils/branchScope.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/sendSuccess.js';

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

  // Prevent creating a site_admin — only the platform holds it.
  if (data.role === 'site_admin') {
    throw ApiError.forbidden('Only the platform can create site admin accounts');
  }

  // Resolve branch: clinic owner must assign to a branch within their tenant.
  let branchId;
  const creatorIsPlatform = (req._roleResolved?.isSystemAdmin ?? ['site_admin', 'clinic_admin', 'super_admin'].includes(req.user.role)) && !tenant;
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

  // Validate the branch belongs to the same tenant (for clinic owners).
  if (tenant) {
    const branch = await Branch.findOne({ _id: branchId, tenant });
    if (!branch) {
      throw ApiError.badRequest('The selected branch does not belong to your clinic', {
        branch: 'not found',
      });
    }
  } else {
    const branch = await Branch.findById(branchId);
    if (!branch) {
      throw ApiError.badRequest('Referenced branch does not exist', { branch: 'not found' });
    }
  }

  // Email uniqueness
  const existing = await User.findOne({ email: data.email });
  if (existing) {
    throw ApiError.conflict('A user with this email already exists');
  }

  // Validate roleId if provided — must exist and belong to same tenant
  if (data.roleId) {
    const roleDoc = await Role.findById(data.roleId);
    if (!roleDoc) {
      throw ApiError.badRequest('Referenced role does not exist', { roleId: 'not found' });
    }
    if (tenant && String(roleDoc.tenant || '') !== String(tenant)) {
      throw ApiError.badRequest('Role does not belong to your clinic', { roleId: 'tenant mismatch' });
    }
  }

  // Plan limit: enforce maxDoctors when creating a doctor.
  if ((data.isDoctor || data.role === 'doctor') && tenant) {
    const tenantDoc = await Tenant.findById(tenant).select('settings');
    const doctorCount = await User.countDocuments({ tenant, $or: [{ isDoctor: true }, { role: 'doctor' }] });
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

  return sendSuccess(res, { user: user.toSafeObject() }, 201);
});

/**
 * GET /api/users
 * List staff. Clinic owner sees only their own tenant's users. Platform admin
 * sees all (with optional ?role / ?branch filters).
 */
export const listUsers = asyncHandler(async (req, res) => {
  const filter = {};

  // Tenant isolation: clinic owners only see their own staff.
  const tenant = currentTenant(req);
  if (tenant) {
    filter.tenant = tenant;
  }

  if (req.query.role) filter.role = req.query.role;
  if (req.query.isDoctor === 'true') {
    filter.$or = [{ isDoctor: true }, { role: 'doctor' }];
  }
  if (req.query.branch) filter.branch = toObjectId(req.query.branch);

  const users = await User.find(filter)
    .populate(POPULATE)
    .sort('-createdAt');

  return sendSuccess(res, { users: users.map((u) => u.toSafeObject()) });
});

/**
 * GET /api/users/doctors
 * Lightweight endpoint — only requires appointments:create permission (since the
 * doctor list is needed when booking an appointment). Separate from the main
 * users list so receptionists/doctors don't need full users:read.
 */
export const listDoctors = asyncHandler(async (req, res) => {
  const filter = {};
  const tenant = currentTenant(req);
  if (tenant) filter.tenant = tenant;
  filter.$or = [{ isDoctor: true }, { role: 'doctor' }];

  const users = await User.find(filter)
    .select('name email role isDoctor branch')
    .sort('name');

  return sendSuccess(res, { doctors: users.map((u) => u.toSafeObject()) });
});

/**
 * GET /api/users/:id
 */
export const getUser = asyncHandler(async (req, res) => {
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
  const data = req.validatedBody;
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const user = await User.findOne(filter);
  if (!user) throw ApiError.notFound('User not found');

  // Prevent changing to site_admin
  if (data.role === 'site_admin') {
    throw ApiError.forbidden('Cannot change a user to site_admin');
  }

  if (data.name !== undefined) user.name = data.name;
  if (data.email !== undefined) user.email = data.email;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.role !== undefined) user.role = data.role;
  if (data.roleId !== undefined) user.roleId = data.roleId;
  if (data.branch !== undefined) user.branch = toObjectId(data.branch);
  if (data.isActive !== undefined) user.isActive = data.isActive;
  if (data.isDoctor !== undefined) user.isDoctor = data.isDoctor;
  if (data.commissionRate !== undefined) user.commissionRate = data.commissionRate;
  if (data.password) user.password = data.password;

  if (data.roleId) {
    const roleDoc = await Role.findById(data.roleId);
    if (!roleDoc) throw ApiError.badRequest('Referenced role does not exist');
    const tenant = currentTenant(req);
    if (tenant && String(roleDoc.tenant || '') !== String(tenant)) {
      throw ApiError.badRequest('Role does not belong to your clinic', { roleId: 'tenant mismatch' });
    }
  }

  await user.save();
  await user.populate(POPULATE);
  return sendSuccess(res, { user: user.toSafeObject() });
});

/**
 * DELETE /api/users/:id
 * Soft-delete (deactivate).
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const user = await User.findOne(filter);
  if (!user) throw ApiError.notFound('User not found');
  user.isActive = false;
  await user.save();
  return sendSuccess(res, { message: 'User deactivated' });
});

/**
 * PATCH /api/users/:id/toggle-active
 * Toggle isActive status (activate / deactivate).
 */
export const toggleUserActive = asyncHandler(async (req, res) => {
  const tenant = currentTenant(req);
  const filter = { _id: req.params.id };
  if (tenant) filter.tenant = tenant;
  const user = await User.findOne(filter);
  if (!user) throw ApiError.notFound('User not found');
  user.isActive = !user.isActive;
  await user.save();
  await user.populate(POPULATE);
  return sendSuccess(res, { user: user.toSafeObject() });
});
