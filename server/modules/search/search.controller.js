import * as searchService from './search.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { filterByBranch } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

export const globalSearch = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const result = await searchService.globalSearch(branchFilter, req.query.q);
  return sendSuccess(res, result);
});
