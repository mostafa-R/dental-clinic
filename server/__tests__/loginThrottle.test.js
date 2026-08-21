/**
 * Tests for per-account login lockout (loginThrottle).
 *
 * Verifies consecutive-failure counting, account locking at the threshold,
 * reset on success, and graceful degradation when Redis is unavailable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRedis } from '../config/redis.js';

vi.mock('../config/redis.js', () => ({
  getRedis: vi.fn(),
}));

function fakeRedis() {
  const store = new Map();
  return {
    status: 'ready',
    _store: store,
    async ttl(key) {
      const entry = store.get(key);
      if (!entry) return -2;
      return entry.expiresAt - Date.now() > 0
        ? Math.ceil((entry.expiresAt - Date.now()) / 1000)
        : -2;
    },
    async incr(key) {
      const entry = store.get(key) || { count: 0, expiresAt: 0 };
      entry.count += 1;
      store.set(key, entry);
      return entry.count;
    },
    async expire(key, seconds) {
      const entry = store.get(key);
      if (entry) {
        entry.expiresAt = Date.now() + seconds * 1000;
      }
      return 1;
    },
    async set(key, value, _mode, seconds) {
      store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n += 1;
      }
      return n;
    },
  };
}

describe('loginThrottle', () => {
  let client;
  let mod;

  beforeEach(async () => {
    vi.clearAllMocks();
    client = fakeRedis();
    getRedis.mockReturnValue(client);
    mod = await import('../utils/loginThrottle.js');
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('allows login attempts while not locked', async () => {
    await expect(mod.assertNotLocked('user@x.com')).resolves.toBeUndefined();
  });

  it('locks the account after the failure threshold', async () => {
    const { MAX_FAILED } = mod.loginThrottleConfig();
    for (let i = 0; i < MAX_FAILED; i += 1) {
      await mod.recordFailedLogin('user@x.com');
    }

    await expect(mod.assertNotLocked('user@x.com')).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('does not lock before the threshold', async () => {
    const { MAX_FAILED } = mod.loginThrottleConfig();
    for (let i = 0; i < MAX_FAILED - 1; i += 1) {
      await mod.recordFailedLogin('user@x.com');
    }

    await expect(mod.assertNotLocked('user@x.com')).resolves.toBeUndefined();
  });

  it('resets the counter and lock on success', async () => {
    const { MAX_FAILED } = mod.loginThrottleConfig();
    for (let i = 0; i < MAX_FAILED; i += 1) {
      await mod.recordFailedLogin('user@x.com');
    }

    await mod.resetFailedLogins('user@x.com');
    await expect(mod.assertNotLocked('user@x.com')).resolves.toBeUndefined();
  });

  it('treats account keys case-insensitively', async () => {
    const { MAX_FAILED } = mod.loginThrottleConfig();
    for (let i = 0; i < MAX_FAILED; i += 1) {
      await mod.recordFailedLogin('User@X.com');
    }

    await expect(mod.assertNotLocked('user@x.com')).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('is a no-op when Redis is unavailable', async () => {
    getRedis.mockReturnValue({ status: 'not-ready' });
    vi.resetModules();
    mod = await import('../utils/loginThrottle.js');

    for (let i = 0; i < 10; i += 1) {
      await mod.recordFailedLogin('user@x.com');
    }
    await expect(mod.assertNotLocked('user@x.com')).resolves.toBeUndefined();
  });
});
