import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

// The REAL monitoring stack is exercised here (healthMonitor / perfMonitor /
// dbMonitor aggregation, status derivation and response shaping). Only the
// environment-leaf dependencies are stubbed so results are deterministic:
//   - getRedisInfo (no Redis server required)
//   - isRedisConnected / getRedis (shared-metrics exporter unplugs cleanly)
//   - getErrorMonitoringStats (in-memory error monitor has no fixtures)
// This is NOT a mock-tautology: the code under test is the real middleware.
vi.mock('../config/redis.js', () => ({
  getRedisInfo: vi.fn(),
  isRedisConnected: vi.fn(() => false),
  getRedis: vi.fn(() => null),
}));
vi.mock('../utils/errorMonitor.js', () => ({ getErrorMonitoringStats: vi.fn() }));

import * as redisConfig from '../config/redis.js';
import * as errorMonitor from '../utils/errorMonitor.js';
import {
  getSystemHealth,
  healthCheckResponse,
  publicHealthResponse,
  metricsResponse,
} from '../utils/healthMonitor.js';
import { perfMiddleware, getPerfStats, resetPerfStats } from '../utils/perfMonitor.js';
import { dbStatsHeader, getDbStats, resetDbStats } from '../utils/dbMonitor.js';

const healthyErrorStats = {
  errors: [],
  summary: { totalErrors: 0, activeAlerts: 0, uniqueErrorTypes: 0, monitoringEnabled: true },
};

const healthyRedisInfo = {
  connected: true,
  usedMemory: '1.00M',
  totalConnections: 1,
  uptime: 60,
  cacheHits: 0,
  cacheMisses: 0,
  hitRate: 0,
};

describe('Performance Monitoring System', () => {
  let app;

  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/dental_os_test';
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(testDbUri);
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    vi.mocked(redisConfig.getRedisInfo).mockResolvedValue(healthyRedisInfo);
    vi.mocked(errorMonitor.getErrorMonitoringStats).mockReturnValue(healthyErrorStats);
    resetPerfStats();
    resetDbStats();
  });

  describe('Health Check Endpoint', () => {
    it('reports healthy with full detail when every component is healthy', async () => {
      app.get('/health', healthCheckResponse);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('healthy');
      expect(response.body.health).toBeDefined();
      expect(response.body.health.checks).toBeInstanceOf(Array);

      // The database check is REAL — it pings the connected test DB.
      const dbCheck = response.body.health.checks.find((c) => c.component === 'database');
      expect(dbCheck).toBeDefined();
      expect(dbCheck.status).toBe('healthy');
    });

    it('exposes a sanitized public health payload (no internals)', async () => {
      app.get('/health', publicHealthResponse);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        status: 'ok',
        message: 'Service is up',
      });
      // Never leaks DB names, versions, pids, or internal error text.
      expect(JSON.stringify(response.body)).not.toMatch(/database|mongoose|pid|error/i);
    });

    it('aggregates all critical component checks with a summary', async () => {
      const health = await getSystemHealth();

      const components = health.checks.map((c) => c.component);
      expect(components).toEqual(
        expect.arrayContaining(['database', 'redis', 'memory', 'disk', 'performance', 'error_monitoring']),
      );
      expect(health.summary.totalChecks).toBe(health.checks.length);
      expect(health.summary.healthy + health.summary.degraded + health.summary.unhealthy).toBe(
        health.checks.length,
      );
      expect(health.summary.criticalFailures).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metrics Endpoint', () => {
    it('serves real aggregated metrics (auth is enforced at the route layer)', async () => {
      // routes.js mounts metricsResponse behind protectSite + authorizeSite —
      // see routes/routes.js:97. Here we verify the real payload shape.
      app.get('/metrics', metricsResponse);

      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.metrics).toBeDefined();
      for (const key of ['health', 'performance', 'database', 'errors', 'redis', 'system']) {
        expect(response.body.metrics[key]).toBeDefined();
      }
      expect(response.body.metrics.health.status).toBe('healthy');
      expect(response.body.metrics.database.summary.monitoringEnabled).toBe(true);
    });

    it('reflects routes tracked by the perf middleware', async () => {
      app.use(perfMiddleware);
      app.get('/api/fast', (_req, res) => res.json({ ok: true }));
      app.get('/metrics', metricsResponse);

      await request(app).get('/api/fast');

      const response = await request(app).get('/metrics');
      expect(response.status).toBe(200);
      const routes = response.body.metrics.performance.routes;
      expect(routes.some((r) => r.route === 'GET /api/fast' && r.count === 1)).toBe(true);
    });
  });

  describe('Performance Middleware', () => {
    it('adds a response-time header and records real route stats', async () => {
      app.use(perfMiddleware);
      app.get('/fast', (_req, res) => res.json({ speed: 'fast' }));

      const response = await request(app).get('/fast');

      expect(response.headers['x-response-time-ms']).toBeDefined();
      expect(Number(response.headers['x-response-time-ms'])).toBeGreaterThan(0);

      const stats = getPerfStats();
      const route = stats.routes.find((r) => r.route === 'GET /fast');
      expect(route).toBeDefined();
      expect(route.count).toBe(1);
      expect(route.errors).toBe(0);
    });

    it('measures a slow route as slower than a fast one', async () => {
      app.use(perfMiddleware);
      app.get('/fast', (_req, res) => res.json({ speed: 'fast' }));
      app.get('/slow', (_req, res) => setTimeout(() => res.json({ speed: 'slow' }), 50));

      const fastResponse = await request(app).get('/fast');
      const slowResponse = await request(app).get('/slow');

      const fastTime = Number(fastResponse.headers['x-response-time-ms']);
      const slowTime = Number(slowResponse.headers['x-response-time-ms']);
      expect(fastTime).toBeLessThan(slowTime);
      expect(slowTime).toBeGreaterThanOrEqual(49);
    });

    it('counts error responses per route', async () => {
      app.use(perfMiddleware);
      app.get('/boom', (_req, res) => res.status(500).json({ error: 'x' }));

      await request(app).get('/boom');

      const route = getPerfStats().routes.find((r) => r.route === 'GET /boom');
      expect(route).toBeDefined();
      expect(route.errors).toBe(1);
    });

    it('reports prdTargetMet when every tracked route is under 200ms', async () => {
      app.use(perfMiddleware);
      app.get('/fast-route', (_req, res) => res.json({ ok: true }));

      await request(app).get('/fast-route');

      const stats = getPerfStats();
      expect(stats.totals.totalRoutes).toBe(1);
      expect(stats.routesUnder200ms).toBe(1);
      expect(stats.prdTargetMet).toBe(true);
    });
  });

  describe('Database Monitoring', () => {
    it('adds a DB stats header when the debug flag is set', async () => {
      app.use(dbStatsHeader);
      app.get('/test', (_req, res) => res.json({ message: 'test' }));

      const response = await request(app).get('/test').set('X-Debug-DB', 'true');

      expect(response.headers['x-db-stats']).toBeDefined();
      const stats = JSON.parse(response.headers['x-db-stats']);
      expect(stats.totalQueries).toBe(getDbStats().summary.totalQueries);
      expect(stats.slowQueryPercentage).toBe(getDbStats().summary.slowQueryPercentage);
    });

    it('omits the DB stats header without the debug flag', async () => {
      app.use(dbStatsHeader);
      app.get('/test', (_req, res) => res.json({ message: 'test' }));

      const response = await request(app).get('/test');

      expect(response.headers['x-db-stats']).toBeUndefined();
    });
  });

  describe('Integration: all monitoring together', () => {
    it('combines perf + db + health middleware without conflicts', async () => {
      app.use(perfMiddleware);
      app.use(dbStatsHeader);
      app.get('/health', healthCheckResponse);
      app.get('/api/test', (_req, res) => res.json({ success: true, data: 'x' }));

      const health = await request(app).get('/health');
      expect(health.status).toBe(200);
      expect(health.headers['x-response-time-ms']).toBeDefined();

      const withDb = await request(app).get('/api/test').set('X-Debug-DB', 'true');
      expect(withDb.status).toBe(200);
      expect(withDb.headers['x-response-time-ms']).toBeDefined();
      expect(withDb.headers['x-db-stats']).toBeDefined();

      const plain = await request(app).get('/api/test');
      expect(plain.status).toBe(200);
      expect(plain.headers['x-db-stats']).toBeUndefined();
      expect(plain.headers['x-response-time-ms']).toBeDefined();
    });

    it('tracks every concurrent response and stays correct over 20 requests', async () => {
      app.use(perfMiddleware);
      app.get('/load-test', (req, res) => res.json({ request: req.query.id }));

      const responses = await Promise.all(
        Array.from({ length: 20 }, (_v, i) =>
          request(app).get('/load-test').query({ id: i }),
        ),
      );

      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.request).toBe(String(i));
        expect(response.headers['x-response-time-ms']).toBeDefined();
      });

      const route = getPerfStats().routes.find((r) => r.route === 'GET /load-test');
      expect(route).toBeDefined();
      expect(route.count).toBe(20);
      expect(route.errors).toBe(0);
    });
  });

  describe('Error handling in monitoring', () => {
    it('reports unhealthy (503) and sanitizes the body when a critical component fails', async () => {
      vi.mocked(redisConfig.getRedisInfo).mockResolvedValue({ connected: false });

      const health = await getSystemHealth();
      expect(health.status).toBe('unhealthy');
      const redisCheck = health.checks.find((c) => c.component === 'redis');
      expect(redisCheck.status).toBe('unhealthy');

      app.get('/health', healthCheckResponse);
      app.get('/public', publicHealthResponse);

      const detailed = await request(app).get('/health');
      expect(detailed.status).toBe(503);
      expect(detailed.body.success).toBe(false);
      expect(detailed.body.health.summary.criticalFailures).toBeGreaterThanOrEqual(1);

      const sanitized = await request(app).get('/public');
      expect(sanitized.status).toBe(503);
      expect(sanitized.body.success).toBe(false);
      expect(sanitized.body).not.toHaveProperty('error');
      expect(JSON.stringify(sanitized.body)).not.toMatch(/redis-down|internal/i);
    });

    it('downgrades the error_monitoring check when alerts exceed thresholds', async () => {
      vi.mocked(errorMonitor.getErrorMonitoringStats).mockReturnValue({
        errors: [{ errorKey: 'E_MONGO', errorRate: 2, totalCount: 10 }],
        summary: {
          totalErrors: 10,
          activeAlerts: 6,
          uniqueErrorTypes: 1,
          monitoringEnabled: true,
        },
      });

      const health = await getSystemHealth();
      const errorCheck = health.checks.find((c) => c.component === 'error_monitoring');
      expect(errorCheck.status).toBe('unhealthy');
      expect(health.status).toBe('unhealthy');
    });
  });
});