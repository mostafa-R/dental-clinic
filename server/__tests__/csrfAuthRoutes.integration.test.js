import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

/**
 * Phase 1.1 CSRF integration tests against actual auth route registrations.
 *
 * Verifies CSRF enforcement on the real login/refresh/impersonation-verification
 * routes (allowed/rejected Origin/Referer) while confirming legitimate browser
 * flows reach the route handler. Controllers are mocked to isolate CSRF + route
 * wiring from DB/service behavior.
 */

vi.mock('../modules/auth/auth.controller.js', () => ({
  login: (_req, res) => res.status(200).json({ success: true, route: 'login' }),
  logout: (_req, res) => res.status(200).json({ success: true, route: 'logout' }),
  refresh: (_req, res) => res.status(200).json({ success: true, route: 'refresh' }),
  updatePreferences: (_req, res) => res.status(200).json({ success: true }),
  verifyImpersonation: (_req, res) => res.status(200).json({ success: true, route: 'verify-impersonation' }),
  getMe: (_req, res) => res.status(200).json({ success: true }),
  getMyPermissions: (_req, res) => res.status(200).json({ success: true }),
}));

vi.mock('../middleware/validate.js', () => ({
  validate: () => (_req, _res, next) => next(),
}));

vi.mock('../middleware/auth.js', () => ({
  protect: (_req, _res, next) => next(),
}));

const { csrfProtection } = await import('../middleware/csrf.js');
const { default: authRouter } = await import('../modules/auth/auth.routes.js');

function buildApp() {
  const app = express();
  const allowedOrigins = ['https://app.example.com'];
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection(allowedOrigins));
  app.use('/api/v1/auth', authRouter);
  // Minimal error handler for ApiError
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

const app = buildApp();

describe('CSRF on actual auth routes (Phase 1.1)', () => {
  describe('POST /api/v1/auth/login', () => {
    it('rejects missing Origin/Referer on cookie-issuing login flow', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.com', password: 'pw' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/CSRF/i);
    });

    it('rejects disallowed Origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://evil.example.com')
        .send({ email: 'a@b.com', password: 'pw' });
      expect(res.status).toBe(403);
    });

    it('allows legitimate browser flow with allowed Origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'https://app.example.com')
        .send({ email: 'a@b.com', password: 'pw' });
      expect(res.status).toBe(200);
      expect(res.body.route).toBe('login');
    });

    it('allows legitimate browser flow with allowed Referer when Origin absent', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Referer', 'https://app.example.com/login')
        .send({ email: 'a@b.com', password: 'pw' });
      expect(res.status).toBe(200);
      expect(res.body.route).toBe('login');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rejects missing Origin/Referer on cookie-issuing refresh flow', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({});
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/CSRF/i);
    });

    it('rejects disallowed Origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://evil.example.com')
        .send({});
      expect(res.status).toBe(403);
    });

    it('allows legitimate browser flow with allowed Origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'https://app.example.com')
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.route).toBe('refresh');
    });
  });

  describe('POST /api/v1/auth/verify-impersonation', () => {
    it('rejects missing Origin/Referer on cookie-issuing impersonation verification', async () => {
      const res = await request(app).post('/api/v1/auth/verify-impersonation').send({ code: 'abc' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/CSRF/i);
    });

    it('rejects disallowed Origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-impersonation')
        .set('Origin', 'https://evil.example.com')
        .send({ code: 'abc' });
      expect(res.status).toBe(403);
    });

    it('allows legitimate browser flow with allowed Origin', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-impersonation')
        .set('Origin', 'https://app.example.com')
        .send({ code: 'abc' });
      expect(res.status).toBe(200);
      expect(res.body.route).toBe('verify-impersonation');
    });
  });
});
