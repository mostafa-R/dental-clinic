import ApiError from './ApiError.js';
import { getRedis } from '../config/redis.js';

/**
 * Per-account login lockout (consecutive-failed-attempt tracking).
 *
 * Complements the IP/email rate limiters (express-rate-limit) with a hard
 * lock: after MAX_FAILED consecutive wrong passwords, the account is locked
 * for LOCK_SECONDS. The counter is reset on a successful login.
 *
 * Graceful degradation: when Redis is unavailable (dev only — production
 * fails fast without Redis), the checks become no-ops so login is not
 * disrupted; the router-level IP/email throttles still apply.
 */

const FAIL_PREFIX = 'login:fail:';
const LOCK_PREFIX = 'login:lock:';
const WINDOW_SECONDS = 15 * 60; // counting window for consecutive failures
const MAX_FAILED = 5;
const LOCK_SECONDS = 15 * 60;

export function loginThrottleConfig() {
  return { MAX_FAILED, LOCK_SECONDS, WINDOW_SECONDS };
}

function redisReady() {
  const redis = getRedis();
  return redis?.status === 'ready' ? redis : null;
}

function accountKey(account) {
  return String(account || '').trim().toLowerCase();
}

/**
 * Throw 429 if the account is currently locked.
 * @param {string} account - email/account identifier
 */
export async function assertNotLocked(account) {
  const key = accountKey(account);
  if (!key) return;
  const redis = redisReady();
  if (!redis) return;

  const ttl = await redis.ttl(`${LOCK_PREFIX}${key}`);
  if (ttl > 0) {
    throw ApiError.tooManyRequests(
      `Too many failed login attempts. Please try again in ${Math.ceil(ttl / 60)} minute(s).`,
    );
  }
}

/**
 * Record a failed login attempt. Locks the account once the consecutive
 * failure threshold is reached.
 * @param {string} account - email/account identifier
 */
export async function recordFailedLogin(account) {
  const key = accountKey(account);
  if (!key) return;
  const redis = redisReady();
  if (!redis) return;

  const failKey = `${FAIL_PREFIX}${key}`;
  const count = await redis.incr(failKey);
  if (count === 1) {
    await redis.expire(failKey, WINDOW_SECONDS);
  }
  if (count >= MAX_FAILED) {
    await redis.del(failKey);
    await redis.set(`${LOCK_PREFIX}${key}`, '1', 'EX', LOCK_SECONDS);
  }
}

/**
 * Clear the failed-login counter and any lock on a successful login.
 * @param {string} account - email/account identifier
 */
export async function resetFailedLogins(account) {
  const key = accountKey(account);
  if (!key) return;
  const redis = redisReady();
  if (!redis) return;

  await redis.del(`${FAIL_PREFIX}${key}`);
  await redis.del(`${LOCK_PREFIX}${key}`);
}
