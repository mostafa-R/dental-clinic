/**
 * Tests for 2FA enforcement on sensitive operations
 * 
 * Verifies that sensitive operations (backups, tenant delete/suspend, impersonation)
 * are blocked when twoFactorEnabled is false for super_admin/admin roles.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies before importing
vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// The real app serializes ApiError via its error handler; the minimal test
// apps need the same so res.body.message is populated for assertions.
function jsonErrorHandler(err, _req, res, _next) {
  res.status(err.statusCode || err.status || 500).json({ message: err.message });
}

describe('2FA Enforcement Middleware', () => {
  let app;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('require2faForSensitiveOps', () => {
    it('should block super_admin without 2FA enabled', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'super_admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Two-factor authentication must be enabled');
    });

    it('should block admin without 2FA enabled', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Two-factor authentication must be enabled');
    });

    it('should allow super_admin with 2FA enabled', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'super_admin',
          twoFactorEnabled: true,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin with 2FA enabled', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'admin',
          twoFactorEnabled: true,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow support role without 2FA (not in required roles)', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'support123',
          email: 'support@test.com',
          role: 'support',
          twoFactorEnabled: false,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should treat site_admin role as super_admin', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'site_admin', // Legacy role equivalent to super_admin
          twoFactorEnabled: false,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Two-factor authentication must be enabled');
    });

    it('should return 401 when no siteAdmin on request', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Not authenticated');
    });

    it('should log blocked attempts', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'super_admin',
          twoFactorEnabled: false,
        };
        req.method = 'POST';
        req.originalUrl = '/sensitive';
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      await request(app).post('/sensitive');

      expect(consoleWarnSpy).toHaveBeenCalled();
      const loggedData = consoleWarnSpy.mock.calls[0][0];
      expect(loggedData.event).toBe('SENSITIVE_OPERATION_BLOCKED_2FA_REQUIRED');
      expect(loggedData.adminEmail).toBe('admin@test.com');
      expect(loggedData.adminRole).toBe('super_admin');
      expect(loggedData.endpoint).toBe('/sensitive');
    });
  });

  describe('require2faSuperAdmin', () => {
    it('should block super_admin without 2FA', async () => {
      const { require2faSuperAdmin } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/destructive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'super_admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2faSuperAdmin, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/destructive');

      expect(res.status).toBe(403);
    });

    it('should allow admin without 2FA (not in required roles)', async () => {
      const { require2faSuperAdmin } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/destructive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2faSuperAdmin, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/destructive');

      expect(res.status).toBe(200);
    });
  });

  describe('Sensitive Operations Integration', () => {
    it('should protect backup creation with 2FA', async () => {
      // This would be an integration test with the actual routes
      // For now, we test the middleware behavior
      const { require2faSuperAdmin } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/api/site/backup', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'super_admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2faSuperAdmin, (req, res) => {
        res.json({ success: true, message: 'Backup created' });
      });

      const res = await request(app).post('/api/site/backup');

      expect(res.status).toBe(403);
    });

    it('should protect tenant deletion with 2FA', async () => {
      const { require2faSuperAdmin } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.delete('/api/site/tenant/:id', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'super_admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2faSuperAdmin, (req, res) => {
        res.json({ success: true, message: 'Tenant deleted' });
      });

      const res = await request(app).delete('/api/site/tenant/123');

      expect(res.status).toBe(403);
    });

    it('should protect tenant suspension with 2FA', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.put('/api/site/tenant/:id/suspend', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true, message: 'Tenant suspended' });
      });

      const res = await request(app).put('/api/site/tenant/123/suspend');

      expect(res.status).toBe(403);
    });

    it('should protect impersonation with 2FA', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/api/site/impersonation/start', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'admin',
          twoFactorEnabled: false,
        };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true, message: 'Impersonation started' });
      });

      const res = await request(app).post('/api/site/impersonation/start');

      expect(res.status).toBe(403);
    });
  });
});
