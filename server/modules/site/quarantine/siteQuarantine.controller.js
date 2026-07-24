import { getAbuseStatsForTenants, resetStatsForTenant } from "../../../services/abuseDetection.js";
import ApiError from "../../../utils/ApiError.js";
import asyncHandler from "../../../utils/asyncHandler.js";
import { sendSuccess } from "../../../utils/sendSuccess.js";
import Tenant from "../tenant/tenant.model.js";

/**
 * PUT /site/quarantine/:tenantId
 * Soft-lock a tenant suspected of abuse. Saves the original status so it can
 * be restored on removal.
 */
export const setQuarantine = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { reason } = req.validatedBody || {};

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  tenant.quarantineReason = reason || 'Abuse detected';
  tenant.quarantinePreviousStatus = tenant.status;
  tenant.status = 'suspended';
  tenant.isActive = false;
  await tenant.save();

  resetStatsForTenant(tenantId);

  req.auditTargetName = tenant.name;
  req.auditDetails = { reason: reason || 'Abuse detected', action: 'quarantine.set' };

  return sendSuccess(res, { message: 'Tenant has been quarantined', tenantId: tenant._id });
});

/**
 * PUT /site/quarantine/:tenantId/remove
 * Remove a tenant from quarantine and restore their previous status.
 */
export const removeQuarantine = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  tenant.status = tenant.quarantinePreviousStatus || 'active';
  tenant.isActive = tenant.status === 'active' || tenant.status === 'trial';
  tenant.quarantineReason = null;
  tenant.quarantinePreviousStatus = null;
  await tenant.save();

  resetStatsForTenant(tenantId);

  req.auditTargetName = tenant.name;
  req.auditDetails = { action: 'quarantine.remove' };

  return sendSuccess(res, { message: 'Tenant has been removed from quarantine', tenantId: tenant._id });
});

/**
 * GET /site/quarantine/checks
 * Return usage anomalies: tenants with abuse flags from automated monitoring.
 */
export const getAbuseChecks = asyncHandler(async (_req, res) => {
  const checks = await getAbuseStatsForTenants();
  return sendSuccess(res, { checks });
});
