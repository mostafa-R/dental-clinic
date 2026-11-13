import { describe, expect, it } from 'vitest';
import { csrfProtection } from '../middleware/csrf.js';

function run(middleware, { method = 'POST', path = '/', headers = {}, cookies = {}, protocol = 'https', host = 'api.example.com' } = {}) {
  const req = {
    method,
    path,
    headers,
    cookies,
    protocol,
    body: {},
    get: (k) => (String(k).toLowerCase() === 'host' ? host : undefined),
  };
  const res = { cookie() {}, setHeader() {} };
  return new Promise((resolve) => {
    middleware(req, res, (err) => resolve(err || null));
  });
}

describe('csrfProtection login protection', () => {
  const mw = csrfProtection(['https://app.example.com']);

  it('blocks login POST without Origin/Referer when no session cookie exists', async () => {
    const err = await run(mw, { path: '/api/v1/auth/login' });
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(403);
  });

  it('allows login POST with allowed Origin when no session cookie exists', async () => {
    const err = await run(mw, {
      path: '/api/v1/auth/login',
      headers: { origin: 'https://app.example.com' },
    });
    expect(err).toBeNull();
  });

  it('blocks login POST with disallowed Origin when no session cookie exists', async () => {
    const err = await run(mw, {
      path: '/api/v1/auth/login',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(403);
  });

  it('allows login POST with allowed Referer when Origin is absent', async () => {
    const err = await run(mw, {
      path: '/api/v1/auth/login',
      headers: { referer: 'https://app.example.com/login' },
    });
    expect(err).toBeNull();
  });
});
