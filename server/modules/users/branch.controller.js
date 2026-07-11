import Branch from './branch.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import { currentTenant } from '../../utils/branchScope.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import ApiError from '../../utils/ApiError.js';

export const listBranches = asyncHandler(async (req, res) => {
  const filter = {};
  const tenant = currentTenant(req);
  if (tenant) filter.tenant = tenant;
  if (req.query.isActive === 'true') filter.isActive = true;
  if (req.query.isActive === 'false') filter.isActive = false;

  const branches = await Branch.find(filter).sort('name').lean();

  return sendSuccess(res, { branches });
});

export const createBranch = asyncHandler(async (req, res) => {
  const { name, address, phone, isActive } = req.validatedBody;
  const tenant = currentTenant(req);
  if (!tenant) {
    throw ApiError.forbidden('You must belong to a tenant to create branches');
  }

  // Enforce maxBranches limit
  const tenantDoc = await Tenant.findById(tenant).lean();
  const branchCount = await Branch.countDocuments({ tenant });
  if (branchCount >= (tenantDoc?.settings?.maxBranches || 1)) {
    throw ApiError.badRequest(`Maximum branch limit (${tenantDoc?.settings?.maxBranches || 1}) reached`);
  }

  const branch = await Branch.create({ tenant, name, address, phone, isActive: isActive ?? true });

  return sendSuccess(res, { branch }, 201);
});

export const updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, isActive } = req.validatedBody;
  const tenant = currentTenant(req);

  const branch = await Branch.findOne({ _id: id, ...(tenant ? { tenant } : {}) });
  if (!branch) throw ApiError.notFound('Branch not found');

  if (name !== undefined) branch.name = name;
  if (address !== undefined) branch.address = address;
  if (phone !== undefined) branch.phone = phone;
  if (isActive !== undefined) branch.isActive = isActive;

  await branch.save();

  return sendSuccess(res, { branch: branch.toObject() });
});

export const deleteBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenant = currentTenant(req);

  const branch = await Branch.findOne({ _id: id, ...(tenant ? { tenant } : {}) });
  if (!branch) throw ApiError.notFound('Branch not found');

  // Prevent deleting the last branch
  const branchCount = await Branch.countDocuments({ tenant: branch.tenant });
  if (branchCount <= 1) {
    throw ApiError.badRequest('Cannot delete the only branch. Create a new branch first.');
  }

  // Prevent deleting a branch that has users assigned
  const User = (await import('./user.model.js')).default;
  const userCount = await User.countDocuments({ branch: id });
  if (userCount > 0) {
    throw ApiError.conflict(
      `Cannot delete branch: ${userCount} user(s) are still assigned. Reassign them first.`,
    );
  }

  await Branch.deleteOne({ _id: id });

  return sendSuccess(res, { message: 'Branch deleted' });
});
