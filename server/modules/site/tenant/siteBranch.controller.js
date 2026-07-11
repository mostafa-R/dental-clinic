import Branch from "../../users/branch.model.js";
import Tenant from "./tenant.model.js";
import User from "../../users/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";
import { escapeRegex } from "../../../utils/escapeRegex.js";

// Get all branches with pagination and filtering
export const getBranches = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, tenant: tenantId, isActive } = req.query;
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  if (tenantId) filter.tenant = tenantId;
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { address: { $regex: safe, $options: "i" } },
    ];
  }

  const [branches, total] = await Promise.all([
    Branch.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("tenant", "name email slug")
      .lean(),
    Branch.countDocuments(filter),
  ]);

  const branchIds = branches.map(b => b._id);
  const userCounts = branchIds.length
    ? await User.aggregate([
        { $match: { branch: { $in: branchIds } } },
        { $group: { _id: '$branch', count: { $sum: 1 } } },
      ])
    : [];
  const userCountMap = new Map(userCounts.map(c => [String(c._id), c.count]));

  const branchesWithCounts = branches.map((branch) => ({
    ...branch,
    usersCount: userCountMap.get(String(branch._id)) || 0,
  }));

  return sendSuccess(res, {
    branches: branchesWithCounts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  });
});

// Get single branch by ID
export const getBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const branch = await Branch.findById(id)
    .populate("tenant", "name email slug")
    .lean();
  if (!branch) {
    throw ApiError.notFound("Branch not found");
  }

  const usersCount = await User.countDocuments({ branch: branch._id });

  return sendSuccess(res, {
    ...branch,
    usersCount,
  });
});

// Create branch for a tenant
export const createBranch = asyncHandler(async (req, res) => {
  const { tenant: tenantId, name, address, phone } = req.validatedBody;

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw ApiError.notFound("Tenant not found");
  }

  if (!tenant.isActive || tenant.status === "suspended" || tenant.status === "archived") {
    throw ApiError.badRequest("Cannot create branch for an inactive tenant");
  }

  // Check branch limit
  const branchCount = await Branch.countDocuments({ tenant: tenantId });
  if (branchCount >= tenant.settings.maxBranches) {
    throw ApiError.badRequest(
      `Branch limit reached (${tenant.settings.maxBranches}). Upgrade the plan to add more branches.`,
    );
  }

  const branch = await Branch.create({ tenant: tenantId, name, address, phone });

  const populated = await Branch.findById(branch._id)
    .populate("tenant", "name email slug")
    .lean();

  return sendSuccess(res, populated, 201);
});

// Update branch
export const updateBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, isActive } = req.validatedBody;

  const branch = await Branch.findById(id);
  if (!branch) {
    throw ApiError.notFound("Branch not found");
  }

  if (name !== undefined) branch.name = name;
  if (address !== undefined) branch.address = address;
  if (phone !== undefined) branch.phone = phone;
  if (isActive !== undefined) branch.isActive = isActive;

  await branch.save();

  const populated = await Branch.findById(branch._id)
    .populate("tenant", "name email slug")
    .lean();

  return sendSuccess(res, populated);
});

// Delete branch
export const deleteBranch = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const branch = await Branch.findById(id);
  if (!branch) {
    throw ApiError.notFound("Branch not found");
  }

  // Check if branch has users
  const usersCount = await User.countDocuments({ branch: branch._id });
  if (usersCount > 0) {
    throw ApiError.badRequest(
      `Cannot delete branch with ${usersCount} active users. Reassign users first.`,
    );
  }

  await Branch.findByIdAndDelete(id);

  return sendSuccess(res, { message: "Branch deleted" });
});
