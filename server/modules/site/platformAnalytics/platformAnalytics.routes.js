import { Router } from 'express';
import { z } from 'zod';
import { protectSite, authorizeSite, requireSitePermission } from '../../../middleware/siteAuth.js';
import { validate } from '../../../middleware/validate.js';
import { SITE_PERMISSIONS } from '../../../constants/sitePermissions.js';
import {
  getPlatformOverview,
  getFinancialAnalytics,
  getInventoryAnalytics,
  getPatientAnalytics,
  getAppointmentAnalytics,
  getDoctorPerformance,
  getTreatmentAnalytics,
  getSaaSBillingAnalytics,
  getSecurityMonitoring,
  getSystemActivity,
  getUsageAnalytics,
  getBackgroundJobs,
  getSiteRoles,
} from './platformAnalytics.controller.js';

const router = Router();

router.use(protectSite);
router.use(authorizeSite('super_admin', 'admin', 'support'));

const dateString = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

const filtersQuerySchema = z.object({
  tenantId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid tenant id').optional(),
  branchId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid branch id').optional(),
  doctorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid doctor id').optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
});

/**
 * @swagger
 * /api/v1/site/analytics/platform/overview:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get comprehensive platform overview
 *     description: >
 *       Site realm. Requires `super_admin`, or an `admin`/`support` whose
 *       effective permissions include `platform:overview:view`. Aggregates
 *       tenants, users, patients, appointments, financials, inventory, SaaS
 *       subscriptions, and system health into a single dashboard payload. No
 *       patient PII is returned.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Platform overview
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/overview',
  requireSitePermission(SITE_PERMISSIONS.PLATFORM_OVERVIEW_VIEW),
  getPlatformOverview,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/financial:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get platform-wide financial analytics
 *     description: >
 *       Requires `financial:view`. Revenue (total/byTenant/byBranch/byDoctor/
 *       byService/byMonth), expenses, payments by method, refunds, commissions,
 *       and outstanding balances. Filters by tenant/branch/doctor/date range.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Financial analytics
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/financial',
  requireSitePermission(SITE_PERMISSIONS.FINANCIAL_VIEW),
  validate(filtersQuerySchema, 'query'),
  getFinancialAnalytics,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/inventory:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get inventory analytics
 *     description: >
 *       Requires `inventory:view`. Items, stock value, low/out-of-stock, expiry,
 *       most-used items, and distribution by category/branch/tenant.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Inventory analytics
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/inventory',
  requireSitePermission(SITE_PERMISSIONS.INVENTORY_VIEW),
  validate(filtersQuerySchema, 'query'),
  getInventoryAnalytics,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/patients:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get patient analytics (level 1, no PII)
 *     description: >
 *       Requires `patient:analytics:view`. Aggregated patient counts recency,
 *       gender, age buckets, and activity — without any patient PII. Raw PHI
 *       is only reachable through per-tenant clinic endpoints for authorized
 *       clinic staff, never via the platform layer.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Patient analytics
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/patients',
  requireSitePermission(SITE_PERMISSIONS.PATIENT_ANALYTICS_VIEW),
  validate(filtersQuerySchema, 'query'),
  getPatientAnalytics,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/appointments:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get appointment analytics
 *     description: >
 *       Requires `appointments:view`. Total/today/upcoming appointments, status
 *       distribution, no-show rate, and distribution by tenant/branch/doctor/
 *       month.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Appointment analytics
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/appointments',
  requireSitePermission(SITE_PERMISSIONS.APPOINTMENTS_VIEW),
  validate(filtersQuerySchema, 'query'),
  getAppointmentAnalytics,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/doctors:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get doctor performance analytics
 *     description: >
 *       Requires `doctors:view`. Per-doctor appointment volume, completion and
 *       no-show rates, distinct patients treated, and commission totals.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Doctor performance
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/doctors',
  requireSitePermission(SITE_PERMISSIONS.DOCTORS_VIEW),
  validate(filtersQuerySchema, 'query'),
  getDoctorPerformance,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/treatments:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get treatment plan analytics
 *     description: >
 *       Requires `treatments:view`. Treatment plan counts by status/branch/
 *       tenant, estimated vs completed revenue, and most common procedures.
 *       No patient PII is returned.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Treatment analytics
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/treatments',
  requireSitePermission(SITE_PERMISSIONS.TREATMENTS_VIEW),
  validate(filtersQuerySchema, 'query'),
  getTreatmentAnalytics,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/saas-billing:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get SaaS billing & subscription analytics
 *     description: >
 *       Requires `saas-billing:view`. MRR/ARR, subscription statuses, revenue
 *       by plan and month, churn, trial conversion, and upcoming renewals.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: SaaS billing analytics
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/saas-billing',
  requireSitePermission(SITE_PERMISSIONS.SAAS_BILLING_VIEW),
  getSaaSBillingAnalytics,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/security:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get security monitoring overview
 *     description: >
 *       Requires `security:view`. Site admin 2FA adoption, Redis-backed login
 *       throttle snapshot (locked accounts + failed challenges), recent
 *       security and impersonation audit events, and audit chain integrity.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Security monitoring
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/security',
  requireSitePermission(SITE_PERMISSIONS.SECURITY_VIEW),
  getSecurityMonitoring,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/activity:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get system activity & health
 *     description: >
 *       Requires `activity:view`. Live health status, uptime, memory, MongoDB/
 *       Redis status, API usage/perf stats, error counts, and today's audit
 *       activity.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: System activity
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/activity',
  requireSitePermission(SITE_PERMISSIONS.ACTIVITY_VIEW),
  getSystemActivity,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/usage:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get global & per-tenant usage/storage analytics
 *     description: >
 *       Requires `usage:view`. Global and per-plan/per-tenant usage counts
 *       (branches, users, doctors, patients, appointments) and estimated
 *       storage usage against configured limits. No patient PII is returned.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Usage analytics
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/usage',
  requireSitePermission(SITE_PERMISSIONS.USAGE_VIEW),
  getUsageAnalytics,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/jobs:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: Get background job status
 *     description: >
 *       Requires `activity:view`. Current running status and last acquisition
 *       time for each scheduled background job (cron) via the cron_locks set.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Background jobs
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get(
  '/jobs',
  requireSitePermission(SITE_PERMISSIONS.ACTIVITY_VIEW),
  getBackgroundJobs,
);

/**
 * @swagger
 * /api/v1/site/analytics/platform/roles:
 *   get:
 *     tags: [Platform Analytics]
 *     summary: List site admin roles
 *     description: >
 *       Returns the static set of site admin roles (`super_admin`, `admin`,
 *       `support`). Protected at the router level by `protectSite` +
 *       `authorizeSite('super_admin', 'admin', 'support')`. Contains no
 *       tenant/patient data.
 *     security:
 *       - bearerAuth: []
 *       - siteCookieAuth: []
 *     responses:
 *       '200':
 *         description: Site admin roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     roles:
 *                       type: object
 *                       description: Role key to role string mapping.
 *                       example:
 *                         SUPER_ADMIN: super_admin
 *                         ADMIN: admin
 *                         SUPPORT: support
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 */
router.get('/roles', getSiteRoles);

export default router;