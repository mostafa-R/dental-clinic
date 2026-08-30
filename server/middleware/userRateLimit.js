import ApiError from '../utils/ApiError.js';
import { getRedis } from '../config/redis.js';

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 100;
const DEFAULT_MESSAGE = 'Too many requests';

// Shared in-memory fallback store for enforceUserRateLimit() (per-user
// limits applied inside protect()/protectSite()). The global userRateLimit
// middleware keeps its own per-instance store so each call site can tune
// limits independently.
const sharedHits = new Map();

// Cleanup expired entries every 5 minutes (in-memory fallback only).
const sharedCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sharedHits) {
    if (now - entry.start > DEFAULT_WINDOW_MS) {
      sharedHits.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (sharedCleanup.unref) sharedCleanup.unref();

function recordInMemory(hits, key, windowMs, max, message) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    hits.set(key, { start: now, count: 1 });
    return;
  }
  entry.count++;
  if (entry.count > max) {
    throw ApiError.tooManyRequests(message);
  }
}

async function recordInRedis(key, windowMs, max, message) {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') {
    throw ApiError.serviceUnavailable('Rate limiting temporarily unavailable');
  }
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000));
    }
    if (count > max) {
      throw ApiError.tooManyRequests(message);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.serviceUnavailable('Rate limiting temporarily unavailable');
  }
}

/**
 * Per-user rate limiting middleware.
 * In production this is backed by Redis (distributed, fail-closed). The
 * in-memory Map is only used as a fallback outside production.
 *
 * This middleware runs pre-auth (in the global request stack) so it can only
 * reliably key on the client IP — see enforceUserRateLimit() for the
 * post-auth per-user counter.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60s)
 * @param {number} options.max - Max requests per window (default: 100)
 * @param {string} options.message - Error message when limit exceeded
 */
export function userRateLimit({ windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX, message = DEFAULT_MESSAGE } = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const hits = new Map();

  // Cleanup expired entries every 5 minutes (in-memory fallback only)
  if (!isProd) {
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of hits) {
        if (now - entry.start > windowMs) {
          hits.delete(key);
        }
      }
    }, 5 * 60 * 1000);
    if (cleanup.unref) cleanup.unref();
  }

  return async (req, res, next) => {
    const userId = req.user?._id || req.ip;
    if (!userId) return next();

    try {
      if (isProd) {
        await recordInRedis(`rl:user:${userId}`, windowMs, max, message);
      } else {
        recordInMemory(hits, userId, windowMs, max, message);
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Enforce a per-user rate limit once the caller has been authenticated.
 * Called from protect()/protectSite() after req.user is known, so requests
 * from many users behind a single NAT/IP are counted individually instead of
 * sharing one global bucket. Throws ApiError on over-limit.
 *
 * @param {string} userId - Authenticated user id.
 * @param {Object} [options]
 * @param {number} options.windowMs - Time window in milliseconds (default: 60s)
 * @param {number} options.max - Max requests per window (default: 100)
 * @param {string} options.message - Error message when limit exceeded
 */
export async function enforceUserRateLimit(userId, { windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX, message = DEFAULT_MESSAGE } = {}) {
  if (!userId) return;
  if (process.env.NODE_ENV === 'production') {
    await recordInRedis(`rl:user:${userId}`, windowMs, max, message);
  } else {
    recordInMemory(sharedHits, String(userId), windowMs, max, message);
  }
}
