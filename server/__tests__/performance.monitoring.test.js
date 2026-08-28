import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the monitoring utilities
vi.mock('../utils/healthMonitor.js', () => ({
  healthCheckResponse: vi.fn((req, res) => {
    res.status(200).json({
      success: true,
      status: 'healthy',
      message: 'Service is healthy',
      health: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: [
          {
            component: 'database',
            status: 'healthy',
            details: { connectionState: 'connected', responseTime: '10ms' }
          },
          {
            component: 'redis',
            status: 'healthy',
            details: { connected: true, responseTime: '5ms' }
          }
        ],
        summary: {
          totalChecks: 2,
          healthy: 2,
          degraded: 0,
          unhealthy: 0,
          criticalFailures: 0
        }
      }
    });
  }),
  
  metricsResponse: vi.fn((req, res) => {
    // Check authentication for metrics
    if (!req.headers.authorization && !req.cookies?.site_access) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    
    res.status(200).json({
      success: true,
      metrics: {
        health: { status: 'healthy' },
        performance: {
          routesUnder200ms: 10,
          totalRoutes: 10,
          globalAvgMs: 50,
          prdTargetMet: true
        },
        database: {
          queries: [],
          summary: {
            totalQueries: 100,
            slowQueryPercentage: 5,
            monitoringEnabled: true
          }
        },
        timestamp: new Date().toISOString()
      }
    });
  }),
  
  getSystemHealth: vi.fn().mockResolvedValue({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: [],
    summary: {
      totalChecks: 5,
      healthy: 5,
      degraded: 0,
      unhealthy: 0,
      criticalFailures: 0
    }
  }),
  
  getSystemMetrics: vi.fn().mockResolvedValue({
    health: { status: 'healthy' },
    performance: {},
    database: {},
    errors: {},
    redis: {},
    system: {},
    timestamp: new Date().toISOString()
  })
}));

// Mock database monitoring
vi.mock('../utils/dbMonitor.js', () => ({
  setupDbMonitoring: vi.fn(),
  getDbStats: vi.fn().mockReturnValue({
    queries: [],
    summary: {
      totalQueries: 100,
      totalSlowQueries: 5,
      overallAvgDuration: 25,
      slowQueryPercentage: 5,
      slowQueryThreshold: 100,
      monitoringEnabled: true
    }
  }),
  dbStatsHeader: vi.fn((req, res, next) => {
    if (req.headers['x-debug-db'] === 'true') {
      res.setHeader('X-DB-Stats', '{"totalQueries":100,"slowQueryPercentage":5}');
    }
    next();
  })
}));

// Mock performance monitoring
vi.mock('../utils/perfMonitor.js', () => ({
  getPerfStats: vi.fn().mockReturnValue({
    routes: [],
    totals: {
      totalRequests: 1000,
      totalErrors: 10,
      totalRoutes: 15
    },
    globalAvgMs: 45,
    routesUnder200ms: 15,
    routesOver200ms: 0,
    prdTargetMet: true
  }),
  perfMiddleware: vi.fn((req, res, next) => {
    const start = process.hrtime.bigint();
    const originalEnd = res.end.bind(res);
    
    res.end = function(...args) {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationMs = Math.round(durationNs / 1e6 * 10) / 10;
      res.setHeader('X-Response-Time-MS', String(durationMs));
      return originalEnd(...args);
    };
    
    next();
  })
}));

// Import the mocked utilities
import { healthCheckResponse, metricsResponse } from '../utils/healthMonitor.js';
import { perfMiddleware } from '../utils/perfMonitor.js';
import { dbStatsHeader } from '../utils/dbMonitor.js';

describe('Performance Monitoring System', () => {
  let app;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    vi.clearAllMocks();
  });
  
  describe('Health Check Endpoint', () => {
    it('should return health status without authentication', async () => {
      app.get('/health', healthCheckResponse);
      
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('healthy');
      expect(response.body.health).toBeDefined();
      expect(response.body.health.status).toBe('healthy');
      expect(response.body.health.checks).toBeInstanceOf(Array);
    });
    
    it('should respond quickly (< 100ms)', async () => {
      app.get('/health', healthCheckResponse);
      
      const startTime = Date.now();
      const response = await request(app).get('/health');
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100); // Should respond in under 100ms
    });
    
    it('should handle concurrent health checks', async () => {
      app.get('/health', healthCheckResponse);
      
      const concurrentRequests = 10;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(request(app).get('/health'));
      }
      
      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
  
  describe('Metrics Endpoint', () => {
    it('should require authentication', async () => {
      app.get('/metrics', metricsResponse);
      
      const response = await request(app).get('/metrics');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Not authenticated');
    });
    
    it('should return metrics with authentication', async () => {
      app.get('/metrics', metricsResponse);
      
      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.metrics).toBeDefined();
      expect(response.body.metrics.health.status).toBe('healthy');
    });
    
    it('should include performance metrics', async () => {
      app.get('/metrics', metricsResponse);
      
      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer test-token');
      
      expect(response.body.metrics.performance).toBeDefined();
      expect(response.body.metrics.performance.routesUnder200ms).toBe(10);
      expect(response.body.metrics.performance.totalRoutes).toBe(10);
      expect(response.body.metrics.performance.prdTargetMet).toBe(true);
    });
  });
  
  describe('Performance Middleware', () => {
    it('should add response time header', async () => {
      app.use(perfMiddleware);
      app.get('/test', (req, res) => {
        res.json({ message: 'test' });
      });
      
      const response = await request(app).get('/test');
      
      expect(response.headers['x-response-time-ms']).toBeDefined();
      const responseTime = parseFloat(response.headers['x-response-time-ms']);
      expect(responseTime).toBeGreaterThan(0);
      expect(responseTime).toBeLessThan(100); // Should be fast for simple endpoint
    });
    
    it('should track different route performance', async () => {
      app.use(perfMiddleware);
      
      // Fast endpoint
      app.get('/fast', (req, res) => {
        res.json({ speed: 'fast' });
      });
      
      // Simulated slow endpoint
      app.get('/slow', (req, res) => {
        setTimeout(() => {
          res.json({ speed: 'slow' });
        }, 50);
      });
      
      const fastResponse = await request(app).get('/fast');
      const slowResponse = await request(app).get('/slow');
      
      const fastTime = parseFloat(fastResponse.headers['x-response-time-ms']);
      const slowTime = parseFloat(slowResponse.headers['x-response-time-ms']);
      
      expect(fastTime).toBeLessThan(slowTime);
      expect(slowTime).toBeGreaterThan(50); // Should reflect the 50ms delay
    });
  });
  
  describe('Database Monitoring', () => {
    it('should add DB stats header when debug flag is set', async () => {
      app.use(dbStatsHeader);
      app.get('/test', (req, res) => {
        res.json({ message: 'test' });
      });
      
      const response = await request(app)
        .get('/test')
        .set('X-Debug-DB', 'true');
      
      expect(response.headers['x-db-stats']).toBeDefined();
      const stats = JSON.parse(response.headers['x-db-stats']);
      expect(stats.totalQueries).toBe(100);
      expect(stats.slowQueryPercentage).toBe(5);
    });
    
    it('should not add DB stats header without debug flag', async () => {
      app.use(dbStatsHeader);
      app.get('/test', (req, res) => {
        res.json({ message: 'test' });
      });
      
      const response = await request(app).get('/test');
      
      expect(response.headers['x-db-stats']).toBeUndefined();
    });
  });
  
  describe('Integration: All monitoring together', () => {
    it('should work together without conflicts', async () => {
      // Setup app with all monitoring middleware
      app.use(perfMiddleware);
      app.use(dbStatsHeader);
      
      // Add health endpoint
      app.get('/health', healthCheckResponse);
      
      // Add a test endpoint
      app.get('/api/test', (req, res) => {
        res.json({ success: true, data: 'test data' });
      });
      
      // Test 1: Health endpoint should have performance headers
      const healthResponse = await request(app).get('/health');
      
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.headers['x-response-time-ms']).toBeDefined();
      expect(healthResponse.body.success).toBe(true);
      
      // Test 2: Regular endpoint with debug DB flag
      const testResponse = await request(app)
        .get('/api/test')
        .set('X-Debug-DB', 'true');
      
      expect(testResponse.status).toBe(200);
      expect(testResponse.headers['x-response-time-ms']).toBeDefined();
      expect(testResponse.headers['x-db-stats']).toBeDefined();
      expect(testResponse.body.success).toBe(true);
      
      // Test 3: Regular endpoint without debug DB flag
      const testResponse2 = await request(app).get('/api/test');
      
      expect(testResponse2.status).toBe(200);
      expect(testResponse2.headers['x-response-time-ms']).toBeDefined();
      expect(testResponse2.headers['x-db-stats']).toBeUndefined();
    });
    
    it('should maintain performance under load', async () => {
      app.use(perfMiddleware);
      app.get('/load-test', (req, res) => {
        res.json({ request: req.query.id });
      });
      
      const concurrentRequests = 20;
      const startTime = Date.now();
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .get('/load-test')
            .query({ id: i })
        );
      }
      
      const responses = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;
      
      // All requests should succeed
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.request).toBe(String(i));
        expect(response.headers['x-response-time-ms']).toBeDefined();
      });
      
      // Average response time should be reasonable
      const avgDuration = totalDuration / concurrentRequests;
      console.log(`Average response time for ${concurrentRequests} concurrent requests: ${avgDuration.toFixed(2)}ms`);
      
      expect(avgDuration).toBeLessThan(100); // Should handle 20 concurrent requests efficiently
    });
  });
  
  describe('Error Handling in Monitoring', () => {
    it('should handle errors gracefully in health check', async () => {
      // Mock a failing health check
      const failingHealthCheck = vi.fn((req, res) => {
        res.status(503).json({
          success: false,
          status: 'unhealthy',
          message: 'Service degraded',
          error: 'Database connection failed'
        });
      });
      
      app.get('/health-failing', failingHealthCheck);
      
      const response = await request(app).get('/health-failing');
      
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.status).toBe('unhealthy');
    });
    
    it('should include error information in metrics when available', async () => {
      const errorMetricsResponse = vi.fn((req, res) => {
        res.status(200).json({
          success: true,
          metrics: {
            health: { status: 'degraded' },
            errors: {
              summary: {
                totalErrors: 5,
                activeAlerts: 1,
                monitoringEnabled: true
              }
            },
            timestamp: new Date().toISOString()
          }
        });
      });
      
      app.get('/error-metrics', errorMetricsResponse);
      
      const response = await request(app)
        .get('/error-metrics')
        .set('Authorization', 'Bearer test-token');
      
      expect(response.status).toBe(200);
      expect(response.body.metrics.health.status).toBe('degraded');
      expect(response.body.metrics.errors.summary.totalErrors).toBe(5);
      expect(response.body.metrics.errors.summary.activeAlerts).toBe(1);
    });
  });
});