import * as siteAnalyticsService from './siteAnalytics.service.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';

export const getGlobalStats = asyncHandler(async (_req, res) => {
  const stats = await siteAnalyticsService.getGlobalStats();
  return sendSuccess(res, stats);
});

export const getGrowthData = asyncHandler(async (req, res) => {
  const data = await siteAnalyticsService.getGrowthData(req.query.period);
  return sendSuccess(res, data);
});

export const getTenantUsage = asyncHandler(async (req, res) => {
  const usage = await siteAnalyticsService.getTenantUsage(req.params.tenantId);
  return sendSuccess(res, usage);
});
