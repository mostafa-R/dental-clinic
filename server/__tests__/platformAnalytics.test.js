/**
 * Tests for platform analytics (super admin role scope).
 *
 * Verifies:
 * - `requireSitePermission` grants `super_admin` a full bypass, enforces the
 *   stored permission strings for admin/support, and rejects unauthenticated
 *   requests.
 * - Route-level authorization: each analytics endpoint is gated by the
 *   expected granular `platform:*` / `financial:view`-style permission and
 *   returns valid JSON envelopes; unauthorized roles get 403.
 * - Query validation rejects non-ObjectId tenant filters.
 * - No patient PHI ever reaches the platform analytics responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../middleware/siteAuth.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    protectSite: (_req, _res, next) => next(),
  };
});

vi.mock('../utils/auditChain.js', () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
  verifyAuditChain: vi.fn().mockResolvedValue({ valid: true, checked: 0, errors: [] }),
}));

vi.mock('../modules/site/platformAnalytics/platformAnalytics.service.js', () => ({
  getPlatformOverview: vi.fn().mockResolvedValue({ overview: 'ok' }),
  getFinancialAnalytics: vi.fn().mockResolvedValue({ revenue: { total: 42 } }),
  getInventoryAnalytics: vi.fn().mockResolvedValue({ summary: {}, byBranch: [], byTenant: [] }),
  getPatientAnalytics: vi.fn().mockResolvedValue({ summary: {}, phiExposure: false }),
  getAppointmentAnalytics: vi.fn().mockResolvedValue({ summary: {} }),
  getDoctorPerformanceAnalytics: vi.fn().mockResolvedValue({ doctors: [], summary: {} }),
  getTreatmentAnalytics: vi.fn().mockResolvedValue({ summary: {}, phiExposure: false }),
  getSaaSBillingAnalytics: vi.fn().mockResolvedValue({ summary: {} }),
  getSecurityMonitoring: vi.fn().mockResolvedValue({ summary: {} }),
  getSystemActivity: vi.fn().mockResolvedValue({ summary: {} }),
  getUsageAnalytics: vi.fn().mockResolvedValue({ global: {} }),
  getBackgroundJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  SITE_ROLES_LIST: ['super_admin', 'admin', 'support'],
}));

import { requireSitePermission } from '../middleware/siteAuth.js';
import platformAnalyticsRouter from '../modules/site/platformAnalytics/platformAnalytics.routes.js';

function jsonErrorHandler(err, _req, res, _next) {
  res.status(err.statusCode || err.status || 500).json({ message: err.message });
}

function buildApp(siteAdmin) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (siteAdmin) req.siteAdmin = siteAdmin;
    next();
  });
  app.use('/api/v1/site/analytics/platform', platformAnalyticsRouter);
  app.use(jsonErrorHandler);
  return app;
}

describe('requireSitePermission middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws at setup time when no permission is provided', () => {
    expect(() => requireSitePermission()).toThrow();
  });

  it('allows super_admin without checking stored permissions', async () => {
    const app = buildApp({ role: 'super_admin', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/overview');
    expect(res.status).toBe(200);
  });

  it('401 for unauthenticated requests', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/v1/site/analytics/platform/overview');
    expect(res.status).toBe(401);
  });

  it('403 for an admin without the required permission string', async () => {
    const app = buildApp({ role: 'admin', permissions: ['analytics:view'] });
    const res = await request(app).get('/api/v1/site/analytics/platform/financial');
    expect(res.status).toBe(403);
  });

  it('403 for support trying to access financial analytics (not in defaults)', async () => {
    const app = buildApp({ role: 'support', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/financial');
    expect(res.status).toBe(403);
  });

  it('403 for a broken role with no effective permissions', async () => {
    const app = buildApp({ role: 'reception', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/overview');
    expect(res.status).toBe(403);
  });
});

describe('platform analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spans all endpoints with the permission gate', async () => {
    const app = buildApp({ role: 'admin', permissions: ['financial:view'] });
    const cases = [
      ['/overview', 403],
      ['/financial', 200],
      ['/inventory', 403],
      ['/patients', 403],
      ['/appointments', 403],
      ['/doctors', 403],
      ['/treatments', 403],
      ['/saas-billing', 403],
      ['/security', 403],
      ['/activity', 403],
      ['/usage', 403],
      ['/jobs', 403],
    ];
    for (const [path, expected] of cases) {
      const res = await request(app).get(`/api/v1/site/analytics/platform${path}`);
      expect(res.status, `GET ${path}`).toBe(expected);
    }
  });

  it('returns valid success envelope for a permitted admin', async () => {
    const app = buildApp({ role: 'admin', permissions: ['financial:view'] });
    const res = await request(app).get('/api/v1/site/analytics/platform/financial');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.revenue.total).toBe(42);
  });

  it('lets support reach its default-granted patient analytics', async () => {
    const app = buildApp({ role: 'support', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/patients');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('super_admin bypasses the granular permission gate', async () => {
    const app = buildApp({ role: 'super_admin', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/security');
    expect(res.status).toBe(200);
  });

  it('rejects an invalid tenantId filter with 400', async () => {
    const app = buildApp({ role: 'super_admin', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/financial?tenantId=not-an-id');
    expect(res.status).toBe(400);
  });

  it('rejects an invalid startDate filter with 400 instead of leaking Invalid Date into Mongo', async () => {
    const app = buildApp({ role: 'super_admin', permissions: [] });
    const res = await request(app).get(
      '/api/v1/site/analytics/platform/appointments?startDate=not-a-date',
    );
    expect(res.status).toBe(400);
  });

  it('lets super_admin drill into an arbitrary tenant via tenantId', async () => {
    const app = buildApp({ role: 'super_admin', permissions: [] });
    const res = await request(app).get(
      `/api/v1/site/analytics/platform/financial?tenantId=${'a'.repeat(24)}&startDate=2025-01-01`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.revenue.total).toBe(42);
  });

  it('403 when an admin targets a specific tenant (scope enforcement)', async () => {
    const app = buildApp({ role: 'admin', permissions: ['financial:view'] });
    const res = await request(app).get(
      `/api/v1/site/analytics/platform/financial?tenantId=${'b'.repeat(24)}`,
    );
    expect(res.status).toBe(403);
  });

  it('403 when support targets a specific tenant on default-granted endpoints', async () => {
    const app = buildApp({ role: 'support', permissions: [] });
    const res = await request(app).get(
      `/api/v1/site/analytics/platform/patients?tenantId=${'c'.repeat(24)}`,
    );
    expect(res.status).toBe(403);
  });

  it('never leaks patient PHI fields from the patient analytics endpoint', async () => {
    const app = buildApp({ role: 'super_admin', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/patients');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    for (const phiField of ['phone', 'email', 'medicalHistory', 'dateOfBirth', 'firstName', 'lastName']) {
      expect(body).not.toContain(phiField);
    }
  });

  it('exposes on roles-only endpoint without extra permissions', async () => {
    const app = buildApp({ role: 'support', permissions: [] });
    const res = await request(app).get('/api/v1/site/analytics/platform/roles');
    expect(res.status).toBe(200);
    expect(res.body.data.roles).toContain('super_admin');
  });
});