/**
 * Covers the error-handling triad:
 *   - middleware/error.js  (notFound + errorHandler — all branch paths)
 *   - utils/errorMonitor.js (ErrorMonitor class, singleton exports, dedup logic)
 *   - utils/dbMonitor.js    (setupDbMonitoring debug hook, getDbStats, dbStatsHeader)
 *
 * All three are pure-logic / unit-testable — no real DB or Redis needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { logError } from '../utils/logger.js';

vi.mock('../utils/logger.js', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─────────────────────────────────────────────────────
// 1. middleware/error.js — notFound + errorHandler
// ─────────────────────────────────────────────────────
import { notFound, errorHandler } from '../middleware/error.js';
import ApiError from '../utils/ApiError.js';

function setupApp() {
  const app = express();
  app.use(express.json());
  // route that throws whatever the test needs
  app.get('/ok', (_req, res) => res.json({ ok: true }));
  app.get('/throw-err', (_req, _res) => { throw new Error('boom'); });
  app.get('/throw-api', (_req, _res) => { throw ApiError.badRequest('bad input', { field: 'x' }); });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('middleware/error.js', () => {
  beforeEach(() => { logError.mockClear(); });

  it('notFound returns 404 for unmatched routes', async () => {
    const res = await request(setupApp()).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Route not found');
  });

  it('generic error returns 500 and logs via logError', async () => {
    const res = await request(setupApp()).get('/throw-err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('boom');
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('ApiError preserves statusCode + details', async () => {
    const res = await request(setupApp()).get('/throw-api');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('bad input');
    expect(res.body.details).toEqual({ field: 'x' });
  });

  it('ValidationError branch (code 11000 — duplicate key)', async () => {
    const app = express();
    app.get('/dup', (_req, _res) => {
      const err = new Error('dup');
      err.code = 11000;
      err.keyValue = { email: 'dup@test.com' };
      throw err;
    });
    app.use(errorHandler);
    const res = await request(app).get('/dup');
    expect(res.status).toBe(409);
    expect(res.body.details.email).toBe('Already exists');
  });

  it('CastError branch', async () => {
    const app = express();
    app.get('/cast', (_req, _res) => {
      const err = new Error('bad id');
      err.name = 'CastError';
      throw err;
    });
    app.use(errorHandler);
    const res = await request(app).get('/cast');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid value');
  });

  it('JsonWebTokenError branch', async () => {
    const app = express();
    app.get('/jwt', (_req, _res) => {
      const err = new Error('bad jwt');
      err.name = 'JsonWebTokenError';
      throw err;
    });
    app.use(errorHandler);
    const res = await request(app).get('/jwt');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token');
  });

  it('TokenExpiredError branch', async () => {
    const app = express();
    app.get('/expired', (_req, _res) => {
      const err = new Error('expired');
      err.name = 'TokenExpiredError';
      throw err;
    });
    app.use(errorHandler);
    const res = await request(app).get('/expired');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token expired');
  });

  it('SyntaxError entity.parse.failed branch', async () => {
    const app = express();
    app.use(express.json());
    app.post('/parse', (_req, _res) => res.json({ ok: true }));
    app.use((err, _req, res, _next) => {
      if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
        return errorHandler(err, _req, res, _next);
      }
      res.status(500).json({ error: true });
    });
    const res = await request(app).post('/parse').set('Content-Type', 'application/json').send('{invalid');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON in request body');
  });

  it('MulterError LIMIT_FILE_SIZE branch', async () => {
    const app = express();
    app.get('/multer-size', (_req, _res) => {
      const err = new Error('too large');
      err.name = 'MulterError';
      err.code = 'LIMIT_FILE_SIZE';
      throw err;
    });
    app.use(errorHandler);
    const res = await request(app).get('/multer-size');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('50MB');
  });

  it('MulterError LIMIT_UNEXPECTED_FILE branch', async () => {
    const app = express();
    app.get('/multer-unexp', (_req, _res) => {
      const err = new Error('unexpected');
      err.name = 'MulterError';
      err.code = 'LIMIT_UNEXPECTED_FILE';
      throw err;
    });
    app.use(errorHandler);
    const res = await request(app).get('/multer-unexp');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Unexpected file field');
  });

  it('MulterError generic fallback branch', async () => {
    const app = express();
    app.get('/multer-gen', (_req, _res) => {
      const err = new Error('upload fail');
      err.name = 'MulterError';
      err.code = 'SOME_OTHER';
      throw err;
    });
    app.use(errorHandler);
    const res = await request(app).get('/multer-gen');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('upload fail');
  });

  it('does not include stack in production', async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = express();
      app.get('/prod', (_req, _res) => { throw new Error('internal'); });
      app.use(errorHandler);
      const res = await request(app).get('/prod');
      expect(res.status).toBe(500);
      expect(res.body.stack).toBeUndefined();
    } finally {
      process.env.NODE_ENV = orig;
    }
  });

  it('includes stack in development', async () => {
    const orig = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const app = express();
      app.get('/dev', (_req, _res) => { throw new Error('dev error'); });
      app.use(errorHandler);
      const res = await request(app).get('/dev');
      expect(res.status).toBe(500);
      expect(res.body.stack).toBeDefined();
    } finally {
      process.env.NODE_ENV = orig;
    }
  });

  it('errorHandler calls logError for server 500 non-ApiError only', async () => {
    const app = express();
    app.get('/api', (_req, _res) => { throw ApiError.internal('not logged'); });
    app.use(errorHandler);
    await request(app).get('/api');
    expect(logError).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────
// 2. utils/errorMonitor.js
// ─────────────────────────────────────────────────────
import {
  errorMonitoringMiddleware,
  getErrorMonitoringStats,
  resetErrorMonitoring,
} from '../utils/errorMonitor.js';
import errorMonitor from '../utils/errorMonitor.js';

describe('ErrorMonitor', () => {
  beforeEach(() => { resetErrorMonitoring(); logError.mockClear(); });

  it('trackError increments count and stores context', () => {
    const err = new Error('test-err');
    err.name = 'TestError';
    const stats = errorMonitor.trackError(err, { url: '/x' });
    expect(stats.count).toBe(1);
    expect(stats.contexts[0].message).toBe('test-err');
  });

  it('capped contexts list to 100 entries', () => {
    const err = new Error('cap');
    for (let i = 0; i < 120; i++) errorMonitor.trackError(err, {});
    const stats = errorMonitor.trackError(err, {});
    expect(stats.count).toBe(121);
    expect(stats.contexts.length).toBe(100);
  });

  it('triggerAlert deduplicates within the same minute', () => {
    const err = new Error('dup');
    err.name = 'DatabaseError'; // in criticalErrorTypes
    errorMonitor.trackError(err, {}); // fires critical_error alert
    expect(errorMonitor.alerts.size).toBe(1);
    errorMonitor.trackError(err, {}); // same minuteKey → dedup
    expect(errorMonitor.alerts.size).toBe(1);
  });

  it('high_error_rate alert fires when rate > threshold', () => {
    const err = new Error('rate');
    err.name = 'RateTest';
    // Simulate 11 errors in the same minute
    for (let i = 0; i < 11; i++) errorMonitor.trackError(err, {});
    const alertKeys = [...errorMonitor.alerts.keys()];
    expect(alertKeys.some(k => k.startsWith('high_error_rate'))).toBe(true);
  });

  it('consecutive_errors alert fires when 5 errors < 5 min window', () => {
    const err = new Error('consec');
    err.name = 'ConsecTest';
    for (let i = 0; i < 5; i++) errorMonitor.trackError(err, {});
    const alertKeys = [...errorMonitor.alerts.keys()];
    expect(alertKeys.some(k => k.startsWith('consecutive_errors'))).toBe(true);
  });

  it('getErrorStats returns summary', () => {
    const err = new Error('stats');
    err.name = 'StatsTest';
    errorMonitor.trackError(err, {});
    const report = getErrorMonitoringStats();
    expect(report.summary.uniqueErrorTypes).toBe(1);
    expect(report.errors[0].totalCount).toBe(1);
  });

  it('resetStats clears everything', () => {
    const err = new Error('reset');
    err.name = 'ResetTest';
    errorMonitor.trackError(err, {});
    resetErrorMonitoring();
    expect(getErrorMonitoringStats().summary.totalErrors).toBe(0);
  });
});

describe('errorMonitoringMiddleware', () => {
  beforeEach(() => { resetErrorMonitoring(); logError.mockClear(); });

  it('tracks the error and calls next', () => {
    const next = vi.fn();
    const err = new Error('mw');
    const req = { originalUrl: '/test', method: 'GET', ip: '127.0.0.1', get: () => 'agent' };
    errorMonitoringMiddleware(err, req, {}, next);
    expect(next).toHaveBeenCalledWith(err);
    const report = getErrorMonitoringStats();
    expect(report.summary.totalErrors).toBe(1);
    expect(report.errors[0].totalCount).toBe(1);
  });

  it('handles missing req.user gracefully', () => {
    const next = vi.fn();
    const err = new Error('no-user');
    const req = { originalUrl: '/', method: 'POST', ip: '::1', get: () => '' };
    errorMonitoringMiddleware(err, req, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

// ─────────────────────────────────────────────────────
// 3. utils/dbMonitor.js
// ─────────────────────────────────────────────────────
import {
  setupDbMonitoring,
  getDbStats,
  resetDbStats,
  dbStatsHeader,
} from '../utils/dbMonitor.js';

describe('dbMonitor', () => {
  let fakeClient;
  let getClientSpy;

  beforeEach(() => {
    resetDbStats();
    vi.restoreAllMocks();
    // The new implementation observes MongoDB driver command-monitoring events
    // on mongoose.connection.getClient() — no mongoose.set('debug') involved.
    fakeClient = new (require('node:events').EventEmitter)();
    getClientSpy = vi.spyOn(mongoose.connection, 'getClient').mockReturnValue(fakeClient);
    setupDbMonitoring();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('setupDbMonitoring attaches command-monitoring event listeners to the driver client', () => {
    // A single listener registered for each command phase.
    expect(getClientSpy).toHaveBeenCalled();
    expect(fakeClient.listenerCount('commandStarted')).toBe(1);
    expect(fakeClient.listenerCount('commandSucceeded')).toBe(1);
    expect(fakeClient.listenerCount('commandFailed')).toBe(1);
    // Calling setup again must not double-attach.
    setupDbMonitoring();
    expect(fakeClient.listenerCount('commandStarted')).toBe(1);
  });

  it('accumulates stats from succeeded commands', () => {
    fakeClient.emit('commandStarted', {
      connectionId: 1,
      requestId: 100,
      commandName: 'find',
      command: { find: 'patients', filter: {} },
    });
    fakeClient.emit('commandSucceeded', {
      connectionId: 1,
      requestId: 100,
      commandName: 'find',
      duration: 12.5,
    });

    const report = getDbStats();
    expect(report.queries.length).toBe(1);
    expect(report.queries[0].query).toBe('patients.find');
    expect(report.queries[0].count).toBe(1);
    expect(report.queries[0].avgDuration).toBe(12.5);
    expect(report.queries[0].errors).toBe(0);
  });

  it('counts failed commands as errors and records their duration', () => {
    fakeClient.emit('commandStarted', {
      connectionId: 1,
      requestId: 101,
      commandName: 'aggregate',
      command: { aggregate: 'invoices', pipeline: [] },
    });
    fakeClient.emit('commandFailed', {
      connectionId: 1,
      requestId: 101,
      commandName: 'aggregate',
      duration: 40,
    });

    const report = getDbStats();
    expect(report.summary.totalQueries).toBe(1);
    expect(report.summary.totalErrors).toBe(1);
    expect(report.queries[0].query).toBe('invoices.aggregate');
    expect(report.queries[0].errors).toBe(1);
  });

  it('marks slow queries when duration exceeds the threshold', () => {
    fakeClient.emit('commandStarted', {
      connectionId: 1,
      requestId: 102,
      commandName: 'find',
      command: { find: 'appointments', filter: {} },
    });
    fakeClient.emit('commandSucceeded', {
      connectionId: 1,
      requestId: 102,
      commandName: 'find',
      duration: 250,
    });

    const report = getDbStats();
    expect(report.queries[0].slowQueries).toBe(1);
    expect(report.summary.slowQueryPercentage).toBe(100);
  });

  it('dbStatsHeader injects X-DB-Stats header in non-production with debug header', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const app = express();
      app.use((req, _res, next) => { req.headers['x-debug-db'] = 'true'; next(); });
      app.use(dbStatsHeader);
      app.get('/test', (_req, res) => res.json({ ok: true }));
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      const header = res.headers['x-db-stats'];
      expect(header).toBeDefined();
      const parsed = JSON.parse(header);
      expect(parsed.monitoringEnabled).toBe(true);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('dbStatsHeader does nothing in production', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = express();
      app.use((req, _res, next) => { req.headers['x-debug-db'] = 'true'; next(); });
      app.use(dbStatsHeader);
      app.get('/test', (_req, res) => res.json({ ok: true }));
      const res = await request(app).get('/test');
      expect(res.headers['x-db-stats']).toBeUndefined();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('dbStatsHeader does nothing without x-debug-db header', async () => {
    const app = express();
    app.use(dbStatsHeader);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    const res = await request(app).get('/test');
    expect(res.headers['x-db-stats']).toBeUndefined();
  });
});
