import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";
import User from "../../users/user.model.js";

export const getUsersByTenant = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const filter = { tenant: tenantId, isActive: true };
  const [users, total] = await Promise.all([
    User.find(filter)
      .select('name email role branch isActive')
      .populate('branch', 'name')
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
