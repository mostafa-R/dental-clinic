import * as service from './platformAnalytics.service.js';
import ApiError from '../../../utils/ApiError.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/sendSuccess.js';
import { appendAuditLog } from '../../../utils/auditChain.js';

const TENANT_LEVEL_FILTERS = ['tenantId', 'branchId', 'doctorId'];

/**
 * Resolve the caller's allowed analytics scope.
 *
 * `super_admin` may drill into a specific tenant/branch/doctor (system-wide
 * scope). Every other role may only read platform-wide aggregates — targeting
 * an arbitrary tenant by guessing an ObjectId would otherwise let any admin
 * extract any tenant's financial/activity slice. Enforcement happens here, at
 * the controller boundary, so the service never even runs a tenant-scoped
 * query for a role that is not allowed to make one.
 */
function buildScopedFilters(req) {
  const filters = { ...(req.validatedQuery || {}) };

  if (req.siteAdmin?.role !== 'super_admin') {
    const targeted = TENANT_LEVEL_FILTERS.filter((key) => filters[key]);
    if (targeted.length > 0) {
      throw ApiError.forbidden(
        'Only a super_admin may filter platform analytics by tenant, branch, or doctor',
      );
    }
  }

  return filters;
}

/**
 * Persist an audit trail entry for tenant-targeted analytics reads so that
 * "who looked at which tenant's data" stays traceable (H3). Platform-wide
 * aggregate reads are not audited to avoid log noise; tenant/branch drill-down
 * is the sensitive case.
 */
async function auditAnalyticsAccess(req, action, filters) {
  const targeted = TENANT_LEVEL_FILTERS.some((key) => filters[key]);
  if (!targeted) return;

  try {
    await appendAuditLog({
      admin: req.siteAdmin._id,
      tenantActor: null,
      scope: 'site',
      adminEmail: req.siteAdmin.email,
      adminRole: req.siteAdmin.role,
      action,
      target: filters.tenantId
        ? { type: 'tenant', id: filters.tenantId }
        : filters.branchId
          ? { type: 'branch', id: filters.branchId }
          : undefined,
      details: { filters, endpoint: req.originalUrl?.split('?')[0] },
      requestId: req.id || null,
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: (req.headers?.['user-agent'] || '').substring(0, 500),
    });
  } catch (err) {
    console.error('[Audit] Failed to persist platform analytics access:', err.message);
  }
}

export const getPlatformOverview = asyncHandler(async (_req, res) => {
  const data = await service.getPlatformOverview();
  return sendSuccess(res, data);
});

export const getFinancialAnalytics = asyncHandler(async (req, res) => {
  const filters = buildScopedFilters(req);
  const data = await service.getFinancialAnalytics(filters);
  await auditAnalyticsAccess(req, 'platform.analytics.financial.read', filters);
  return sendSuccess(res, data);
});

export const getInventoryAnalytics = asyncHandler(async (req, res) => {
  const filters = buildScopedFilters(req);
  const data = await service.getInventoryAnalytics(filters);
  await auditAnalyticsAccess(req, 'platform.analytics.inventory.read', filters);
  return sendSuccess(res, data);
});

export const getPatientAnalytics = asyncHandler(async (req, res) => {
  const filters = buildScopedFilters(req);
  const data = await service.getPatientAnalytics(filters);
  await auditAnalyticsAccess(req, 'platform.analytics.patients.read', filters);
  return sendSuccess(res, data);
});

export const getAppointmentAnalytics = asyncHandler(async (req, res) => {
  const filters = buildScopedFilters(req);
  const data = await service.getAppointmentAnalytics(filters);
  await auditAnalyticsAccess(req, 'platform.analytics.appointments.read', filters);
  return sendSuccess(res, data);
});

export const getDoctorPerformance = asyncHandler(async (req, res) => {
  const filters = buildScopedFilters(req);
  const data = await service.getDoctorPerformanceAnalytics(filters);
  await auditAnalyticsAccess(req, 'platform.analytics.doctors.read', filters);
  return sendSuccess(res, data);
});

export const getTreatmentAnalytics = asyncHandler(async (req, res) => {
  const filters = buildScopedFilters(req);
  const data = await service.getTreatmentAnalytics(filters);
  await auditAnalyticsAccess(req, 'platform.analytics.treatments.read', filters);
  return sendSuccess(res, data);
});

export const getSaaSBillingAnalytics = asyncHandler(async (_req, res) => {
  const data = await service.getSaaSBillingAnalytics();
  return sendSuccess(res, data);
});

export const getSecurityMonitoring = asyncHandler(async (_req, res) => {
  const data = await service.getSecurityMonitoring();
  return sendSuccess(res, data);
});

export const getSystemActivity = asyncHandler(async (_req, res) => {
  const data = await service.getSystemActivity();
  return sendSuccess(res, data);
});

export const getUsageAnalytics = asyncHandler(async (_req, res) => {
  const data = await service.getUsageAnalytics({});
  return sendSuccess(res, data);
});

export const getBackgroundJobs = asyncHandler(async (_req, res) => {
  const data = await service.getBackgroundJobs();
  return sendSuccess(res, data);
});

export const getSiteRoles = asyncHandler(async (_req, res) => {
  return sendSuccess(res, { roles: service.SITE_ROLES_LIST });
});