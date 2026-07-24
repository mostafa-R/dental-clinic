import * as dashboardService from './dashboard.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { filterByBranch } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

export const getStats = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const result = await dashboardService.getDashboardStats(branchFilter, req.user, req._roleResolved?.isSystemAdmin);
  return sendSuccess(res, result);
});
