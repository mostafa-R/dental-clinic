import ApiError from '../utils/ApiError.js';

/**
 * Per-user rate limiting middleware.
 * Uses in-memory Map with automatic cleanup. For production, replace with Redis-based store.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60s)
 * @param {number} options.max - Max requests per window (default: 100)
 * @param {string} options.message - Error message when limit exceeded
 */
export function userRateLimit({ windowMs = 60 * 1000, max = 100, message = 'Too many requests' } = {}) {
  const hits = new Map();

  // Cleanup expired entries every 5 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start > windowMs) {
        hits.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    const userId = req.user?._id || req.ip;
    if (!userId) return next();

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
