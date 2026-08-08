import * as searchService from './search.service.js';
import { resolveRole } from '../../middleware/checkPermission.js';
import { planIncludesModule } from '../../constants/plans.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { filterByBranch } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

export const globalSearch = asyncHandler(async (req, res) => {
  const branchFilter = filterByBranch(req);
  const role = req._roleResolved || (await resolveRole(req));
  const { isSystemAdmin, permissionMap } = role;
  const perms = permissionMap();
  const can = (module) =>
    isSystemAdmin ||
    ((perms[module] || []).includes('read') && planIncludesModule(req.user.tenant, module));
  const result = await searchService.globalSearch(branchFilter, req.query.q, can, {
    userId: req.user._id,
    impersonating: req.isImpersonation,
  });
  if (req.isImpersonation) {
    for (const key of Object.keys(result)) {
      result[key] = stripPHI(result[key]);
    }
  }
  return sendSuccess(res, result);
});
