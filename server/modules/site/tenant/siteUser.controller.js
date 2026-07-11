import User from "../../users/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";

export const getUsersByTenant = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const users = await User.find({ tenant: tenantId, isActive: true })
    .select('name email role branch isActive')
    .populate('branch', 'name')
    .lean();
  return sendSuccess(res, { users });
});
