import ApiError from '../utils/ApiError.js';
import { getRedis } from '../config/redis.js';

/**
 * Per-user rate limiting middleware.
 * In production this is backed by Redis (distributed, fail-closed). The
 * in-memory Map is only used as a fallback outside production.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60s)
 * @param {number} options.max - Max requests per window (default: 100)
 * @param {string} options.message - Error message when limit exceeded
 */
export function userRateLimit({ windowMs = 60 * 1000, max = 100, message = 'Too many requests' } = {}) {
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

    if (isProd) {
      const redis = getRedis();
      if (!redis || redis.status !== 'ready') {
        return next(ApiError.serviceUnavailable('Rate limiting temporarily unavailable'));
      }
      try {
        const key = `rl:user:${userId}`;
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, Math.ceil(windowMs / 1000));
        }
        if (count > max) {
          return next(ApiError.tooManyRequests(message));
        }
        return next();
      } catch {
        return next(ApiError.serviceUnavailable('Rate limiting temporarily unavailable'));
      }
    }

    const now = Date.now();
    const entry = hits.get(userId);

    if (!entry || now - entry.start > windowMs) {
      hits.set(userId, { start: now, count: 1 });
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      return next(ApiError.tooManyRequests(message));
    }

    next();
  };
}
