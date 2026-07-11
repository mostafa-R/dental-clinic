import * as featureFlagService from './featureFlag.service.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';

export const getTenantModules = asyncHandler(async (req, res) => {
  const result = await featureFlagService.getTenantModules(req.params.tenantId);
  return sendSuccess(res, result);
});

export const toggleModule = asyncHandler(async (req, res) => {
  const result = await featureFlagService.toggleModule(req.params.tenantId, req.validatedBody);
  req.auditTargetName = result.tenantName;
  req.auditDetails = { module: req.validatedBody.module, enabled: req.validatedBody.enabled };
  return sendSuccess(res, { tenantId: result.tenantId, enabledModules: result.enabledModules });
});

export const setModules = asyncHandler(async (req, res) => {
  const result = await featureFlagService.setModules(req.params.tenantId, req.validatedBody);
  req.auditTargetName = result.tenantName;
  req.auditDetails = { modules: req.validatedBody.modules };
  return sendSuccess(res, { tenantId: result.tenantId, enabledModules: result.enabledModules });
});
