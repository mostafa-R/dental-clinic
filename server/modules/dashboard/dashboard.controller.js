import * as dashboardService from './dashboard.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { filterByBranch } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

export const getStats = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  // Pass the whole resolved role, not just `isSystemAdmin`: the module list is
  // built from the plan AND the caller's grants, so it needs `permissionMap`.
  const result = await dashboardService.getDashboardStats(branchFilter, req.user, req._roleResolved);
  return sendSuccess(res, result);
});
