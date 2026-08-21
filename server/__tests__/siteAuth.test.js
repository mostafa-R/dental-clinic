/**
 * Tests for site-admin authorization middleware (`authorizeSite`).
 *
 * Verifies:
 * - Role gating still works (super_admin / admin / support).
 * - The legacy `site_admin` role is rejected.
 * - Granular `permissions` are enforced for non-super_admin roles.
 * - An empty permissions array falls back to the role's default grants.
 * - `super_admin` always has full access regardless of stored permissions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authorizeSite } from '../middleware/siteAuth.js';

vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

function jsonErrorHandler(err, _req, res, _next) {
  res.status(err.statusCode || err.status || 500).json({ message: err.message });
}

function buildApp(siteAdmin) {
  const app = express();
  app.use(express.json());
  app.get(
    '/admin-route',
    (req, res, next) => {
      req.siteAdmin = siteAdmin;
      next();
    },
    authorizeSite('super_admin', 'admin'),
    (req, res) => res.json({ success: true }),
  );
  app.get(
    '/super-only',
    (req, res, next) => {
      req.siteAdmin = siteAdmin;
      next();
    },
    authorizeSite('super_admin'),
    (req, res) => res.json({ success: true }),
  );
  app.use(jsonErrorHandler);
  return app;
}

describe('authorizeSite middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows super_admin regardless of stored permissions', async () => {
    const app = buildApp({ _id: 's1', email: 'root@x.com', role: 'super_admin', permissions: [] });
    const res = await request(app).get('/admin-route');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows admin role whose stored permissions overlap the role default', async () => {
    const app = buildApp({
      _id: 'a1',
      email: 'admin@x.com',
      role: 'admin',
      permissions: ['tenants:view', 'analytics:view'],
    });
    const res = await request(app).get('/admin-route');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('falls back to role defaults when permissions are empty', async () => {
    const app = buildApp({ _id: 'a2', email: 'admin2@x.com', role: 'admin', permissions: [] });
    const res = await request(app).get('/admin-route');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('blocks a role whose stored permissions authorize nothing on this route', async () => {
    const app = buildApp({
      _id: 'a3',
      email: 'restricted@x.com',
      role: 'admin',
      permissions: ['plans:view'], // plans:view is not part of the admin role default set
    });
    const res = await request(app).get('/admin-route');
    expect(res.status).toBe(403);
  });

  it('blocks the dead legacy site_admin role', async () => {
    const app = buildApp({ _id: 's2', email: 'legacy@x.com', role: 'site_admin', permissions: [] });
    const res = await request(app).get('/admin-route');
    expect(res.status).toBe(403);
  });

  it('blocks support role from a super_admin-only route', async () => {
    const app = buildApp({
      _id: 'sup1',
      email: 'support@x.com',
      role: 'support',
      permissions: ['tenants:view'],
    });
    const res = await request(app).get('/super-only');
    expect(res.status).toBe(403);
  });
});
