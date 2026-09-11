import mongoose from 'mongoose';

import Branch from './branch.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import Counter from '../../core/counters.js';
import { withTransaction } from '../../core/transaction.js';
import { currentTenant } from '../../utils/branchScope.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import ApiError from '../../utils/ApiError.js';
import { emitToBranch } from '../../socket/index.js';
import { auditTenantAction } from '../../middleware/audit.js';

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

  // Enforce maxBranches atomically: the slot claim ($inc on the per-tenant
  // counter) and the insert run inside ONE transaction, so concurrent creates
  // contend on the counter instead of both passing a stale countDocuments.
  const tenantDoc = await Tenant.findById(tenant).select('settings').lean();
  const maxBranches = tenantDoc?.settings?.maxBranches || 1;

  const branch = await withTransaction(async (session) => {
    const slotDoc = await Counter.findOneAndUpdate(
      { _id: `branch_slots:${String(tenant)}` },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, session },
    );
    const used = slotDoc?.seq ?? 1;
    if (used > maxBranches) {
      // Aborting the transaction rolls back the $inc, releasing the slot.
      throw ApiError.badRequest(`Maximum branch limit (${maxBranches}) reached`);
    }

    const [created] = await Branch.create(
      [{ tenant, name, address, phone, isActive: isActive ?? true }],
      { session },
    );
    return created;
  });

  // Emit to the creating user's branch room, not the new branch's (empty)
  // room — nobody is subscribed to a branch that didn't exist a second ago.
  // The creator's own clients are the ones that need the immediate refresh.
  const creatorBranch = req.user?.branch ? String(req.user.branch) : null;
  if (creatorBranch) {
    emitToBranch(creatorBranch, 'branch:created', { branch: branch.toObject() });
  }
  return sendSuccess(res, { branch }, 201);
});

export const updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid branch id');
  }
  const { name, address, phone, isActive } = req.validatedBody;
  const tenant = currentTenant(req);

  const branch = await Branch.findOne({ _id: id, ...(tenant ? { tenant } : {}) });
  if (!branch) throw ApiError.notFound('Branch not found');

  if (name !== undefined) branch.name = name;
  if (address !== undefined) branch.address = address;
  if (phone !== undefined) branch.phone = phone;
  if (isActive !== undefined) branch.isActive = isActive;

  await branch.save();

  emitToBranch(String(branch._id), 'branch:updated', { branch: branch.toObject() });
  return sendSuccess(res, { branch: branch.toObject() });
});

export const deleteBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw ApiError.badRequest('Invalid branch id');
  }
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

  // Delete + release the branch plan slot in ONE transaction so a deletion
  // frees quota for a future create (mirrors releasePatientSlot).
  await withTransaction(async (session) => {
    await Branch.deleteOne({ _id: id }, { session });
    await Counter.findOneAndUpdate(
      { _id: `branch_slots:${String(branch.tenant)}` },
      { $inc: { seq: -1 } },
      { session },
    );
  });

  await auditTenantAction(
    req,
    'branch.delete',
    { type: 'branch', id: branch._id, name: branch.name },
    { tenant: String(branch.tenant || '') },
  );

  emitToBranch(String(id), 'branch:deleted', { _id: id });
  return sendSuccess(res, { message: 'Branch deleted' });
});
