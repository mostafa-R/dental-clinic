/**
 * Tests for 2FA enforcement on sensitive operations
 *
 * Verifies that sensitive operations (backups, tenant delete/suspend, impersonation)
 * are blocked for super_admin/admin roles unless the current session can prove it
 * completed a 2FA challenge recently. Merely having twoFactorEnabled on the account
 * is not enough: the site_access token must carry twoFactorVerified=true and a
 * fresh twoFactorVerifiedAt timestamp.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { require2faChallenge } from '../middleware/require2fa.js';
import SiteAdmin from '../modules/site/admin/admin.model.js';
import * as redisConfig from '../config/redis.js';

// Mock dependencies before importing
vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(() => null),
}));

vi.mock('../modules/site/admin/admin.model.js', () => {
  class MockSiteAdmin {}
  MockSiteAdmin.findById = vi.fn();
  return { default: MockSiteAdmin };
});

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

const MINUTE = 60 * 1000;

// The challenge guard signs and verifies with JWT_2FA_SECRET || JWT_SECRET.
const CHALLENGE_SECRET = 'test-challenge-secret';

function signChallenge({ sub, jti, type = '2fa_challenge' }) {
  return jwt.sign({ type, sub, ...(jti ? { jti } : {}) }, CHALLENGE_SECRET, { expiresIn: '5m' });
}

describe('require2faChallenge (single-use challenge replay guard)', () => {
  function makeChallengeApp() {
    const app = express();
    app.use(express.json());
    app.post('/challenge', (req, res, next) => {
      req.validatedBody = req.body;
      next();
    }, require2faChallenge, (req, res) => {
      res.json({ success: true, adminId: String(req._2faAdmin._id) });
    });
    app.use(jsonErrorHandler);
    return app;
  }

  beforeAll(() => {
    // The middleware verifies with JWT_2FA_SECRET || JWT_SECRET; pin both so
    // signed fixtures always match regardless of the ambient environment.
    process.env.JWT_2FA_SECRET = CHALLENGE_SECRET;
    process.env.JWT_SECRET = CHALLENGE_SECRET;
  });

  beforeEach(() => {
    vi.mocked(SiteAdmin.findById).mockReset();
  });

  it('rejects a missing challenge token', async () => {
    const res = await request(makeChallengeApp())
      .post('/challenge')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('2FA challenge token is required');
  });

  it('rejects an invalid or expired challenge token', async () => {
    const res = await request(makeChallengeApp())
      .post('/challenge')
      .send({ challengeToken: 'not-a-jwt' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired challenge token');
  });

  it('rejects a token that is not of type 2fa_challenge', async () => {
    const other = jwt.sign({ type: 'site_access', sub: 'a1' }, CHALLENGE_SECRET, { expiresIn: '5m' });
    const res = await request(makeChallengeApp())
      .post('/challenge')
      .send({ challengeToken: other });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token type');
  });

  it('rejects a token without a jti (cannot be a single-use challenge)', async () => {
    const noJti = jwt.sign({ type: '2fa_challenge', sub: 'a1' }, CHALLENGE_SECRET, { expiresIn: '5m' });
    const res = await request(makeChallengeApp())
      .post('/challenge')
      .send({ challengeToken: noJti });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Challenge token has already been used');
  });

  it('accepts a fresh challenge once and forwards the admin', async () => {
    const admin = { _id: 'a1', isActive: true, email: 'admin@test.com' };
    vi.mocked(SiteAdmin.findById).mockResolvedValue(admin);

    const token = signChallenge({ sub: 'a1', jti: 'unique-jti-1' });
    const res = await request(makeChallengeApp())
      .post('/challenge')
      .send({ challengeToken: token });
    expect(res.status).toBe(200);
    expect(res.body.adminId).toBe('a1');
    expect(SiteAdmin.findById).toHaveBeenCalledWith('a1');
  });

  it('rejects a replayed challenge token on second use (jti replay guard)', async () => {
    const admin = { _id: 'a1', isActive: true };
    vi.mocked(SiteAdmin.findById).mockResolvedValue(admin);
    const req = request(makeChallengeApp());

    const token = signChallenge({ sub: 'a1', jti: 'unique-jti-2' });
    const first = await req.post('/challenge').send({ challengeToken: token });
    expect(first.status).toBe(200);

    const replay = await req.post('/challenge').send({ challengeToken: token });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toBe('Challenge token has already been used');
  });

  it('rejects when the admin no longer exists or is disabled', async () => {
    vi.mocked(SiteAdmin.findById).mockResolvedValue(null);

    const token = signChallenge({ sub: 'ghost', jti: 'unique-jti-3' });
    const res = await request(makeChallengeApp())
      .post('/challenge')
      .send({ challengeToken: token });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Admin not found or disabled');
  });

  it('claims the jti atomically via Redis SET NX when Redis is ready', async () => {
    // Simulate a live Redis: SET NX returns 'OK' the first time and undefined
    // on a duplicate key, so the replay guard is atomic even pre-TTL expiry.
    const claimedKeys = new Set();
    const fakeRedis = {
      status: 'ready',
      set: vi.fn(async (key, _value, _mode, seconds, nx) => {
        if (nx === 'NX' && claimedKeys.has(key)) return undefined;
        claimedKeys.add(key);
        return 'OK';
      }),
    };
    vi.mocked(redisConfig.getRedis).mockReturnValue(fakeRedis);
    const admin = { _id: 'a1', isActive: true, email: 'admin@test.com' };
    vi.mocked(SiteAdmin.findById).mockResolvedValue(admin);
    const req = request(makeChallengeApp());

    const token = signChallenge({ sub: 'a1', jti: 'redis-jti-1' });
    const first = await req.post('/challenge').send({ challengeToken: token });
    expect(first.status).toBe(200);

    const replay = await req.post('/challenge').send({ challengeToken: token });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toBe('Challenge token has already been used');
    expect(fakeRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('2fa:challenge:used:redis-jti-1'),
      '1',
      'EX',
      300,
      'NX',
    );
  });
});

describe('2FA Enforcement Middleware', () => {
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Two-factor authentication must be enabled');
    });

    it('should allow super_admin with 2FA enabled and a fresh verification', async () => {
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow admin with 2FA enabled and a fresh verification', async () => {
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
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

    it('should not treat legacy site_admin role as super_admin (mapping removed)', async () => {
      const { require2fa } = await import('../middleware/require2fa.js');

      const app = express();
      app.use(express.json());

      app.post('/sensitive', (req, res, next) => {
        req.siteAdmin = {
          _id: 'admin123',
          email: 'admin@test.com',
          role: 'site_admin', // Dead legacy role — must NOT be elevated to super_admin
          twoFactorEnabled: false,
        };
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      // The 2FA gate only applies to super_admin/admin; the dead role is not
      // one of them, so the request passes through.
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
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

    it('should block when token carries no verified claim even if 2FA is enabled', async () => {
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
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Two-factor verification is required');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'SENSITIVE_OPERATION_BLOCKED_2FA_NOT_VERIFIED' })
      );
    });

    it('should block a verified token that lacks the twoFactorVerifiedAt timestamp', async () => {
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
        req.siteTokenClaims = { twoFactorVerified: true };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Two-factor verification is required');
    });

    it('should block a stale verification older than the freshness window', async () => {
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() - 20 * MINUTE };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Two-factor verification has expired');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'SENSITIVE_OPERATION_BLOCKED_2FA_STALE' })
      );
    });

    it('should allow a verification that is still within the freshness window', async () => {
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() - 10 * MINUTE };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).post('/sensitive');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should honor a per-route maxAgeSeconds option', async () => {
      const { require2faForSensitiveOps } = await import('../middleware/require2fa.js');
      const strict2fa = require2faForSensitiveOps(['super_admin'], { maxAgeSeconds: 60 });

      const app = express();
      app.use(express.json());

      app.post('/strict-fresh', (req, res, next) => {
        req.siteAdmin = { _id: 'a', role: 'super_admin', twoFactorEnabled: true };
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() - 30 * 1000 };
        next();
      }, strict2fa, (req, res) => {
        res.json({ success: true });
      });
      app.post('/strict-stale', (req, res, next) => {
        req.siteAdmin = { _id: 'a', role: 'super_admin', twoFactorEnabled: true };
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() - 2 * 60 * 1000 };
        next();
      }, strict2fa, (req, res) => {
        res.json({ success: true });
      });
      app.use(jsonErrorHandler);

      const fresh = await request(app).post('/strict-fresh');
      const stale = await request(app).post('/strict-stale');

      expect(fresh.status).toBe(200);
      expect(stale.status).toBe(403);
      expect(stale.body.message).toContain('Two-factor verification has expired');
    });

    it('should log blocked attempts with the 2FA_REQUIRED event', async () => {
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
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
        req.siteTokenClaims = { twoFactorVerified: true, twoFactorVerifiedAt: Date.now() };
        next();
      }, require2fa, (req, res) => {
        res.json({ success: true, message: 'Impersonation started' });
      });

      const res = await request(app).post('/api/site/impersonation/start');

      expect(res.status).toBe(403);
    });
  });
});
