import asyncHandler from "../../../utils/asyncHandler.js";
import { escapeRegex } from "../../../utils/escapeRegex.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";
import User from "../../users/user.model.js";

// Global user search (command palette, admin lookup). Returns a small capped
// list — never a full dump — with the owning tenant populated.
export const searchUsers = asyncHandler(async (req, res) => {
  const { search = "", limit = 6 } = req.query;
  const safeLimit = Math.min(20, Math.max(1, parseInt(limit, 10) || 6));
  const filter = {};
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }
  const users = await User.find(filter)
    .select("name email tenant")
    .populate("tenant", "name")
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();
  return sendSuccess(res, { users });
});

export const getUsersByTenant = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  // Tenant is already validated by requireTenantAccess middleware
  // and available as req.targetTenant
  const filter = { tenant: tenantId, isActive: true };

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email roleId branch isActive')
      .populate('branch', 'name')
      .populate('roleId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    User.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    users,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});
