import * as searchService from './search.service.js';
import { resolveRole } from '../../middleware/checkPermission.js';
import { planIncludesModule } from '../../constants/plans.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { filterByBranch } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';

export const globalSearch = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const role = req._roleResolved || (await resolveRole(req));
  const { isSystemAdmin, permissionMap } = role;
  const perms = permissionMap();
  const can = (module) =>
    isSystemAdmin ||
    ((perms[module] || []).includes('read') && planIncludesModule(req.user.tenant, module));
  const result = await searchService.globalSearch(branchFilter, req.query.q, can);
  return sendSuccess(res, result);
});
