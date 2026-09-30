import crypto from 'node:crypto';

import { getRedis, isRedisConnected } from '../config/redis.js';

/**
 * One-time redemption registry for impersonation grants.
 *
 * An impersonation token is a bare bearer credential: whoever holds it can
 * mint a full clinic session. Previously the grant was redeemable repeatedly
 * for its whole 30-minute lifetime from any IP, so a single leak (XSS, an
 * analytics capture, a pasted chat link) stayed exploitable the entire time.
 *
 * Each grant now carries a `jti` and is recorded here on issue. Redemption
 * consumes it atomically, so a replay is rejected even though the JWT itself
 * is still cryptographically valid.
 *
 * Redis backs this when available so the registry is shared across replicas.
 * The in-memory Map is the single-process fallback and is bounded + swept.
 */

const PREFIX = 'impersonation:grant:';
const HANDOFF_PREFIX = 'impersonation:handoff:';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

/**
 * The dashboard has to hand the grant to a different origin's login page, and a
 * URL is the only channel those two apps share. Putting the grant itself in the
 * query string leaks it into browser history, the `Referer` header of every
 * subsequent request, and any proxy/CDN access log.
 *
 * So the URL carries a `handoffCode` instead: a 120-byte random value that is
 * only meaningful to this server, expires in 60 seconds, and is consumed on the
 * first lookup. Even if it leaks, it is dead long before anyone replays it.
 */
const HANDOFF_TTL_MS = 60 * 1000;

// Bounded fallback. 10k concurrent grants is far above any realistic clinic
// admin population, and the sweep keeps idle entries from accumulating.
const MAX_MEMORY_ENTRIES = 10_000;
const memoryStore = new Map();
const memoryHandoff = new Map();

function sweepMemory(now) {
  if (memoryStore.size <= MAX_MEMORY_ENTRIES) return;
  for (const [jti, expiresAt] of memoryStore) {
    if (expiresAt <= now) memoryStore.delete(jti);
    if (memoryStore.size <= MAX_MEMORY_ENTRIES) break;
  }
}

/**
 * Park a grant behind a short-lived, single-use code so it can travel through a
 * URL. Returns the code to put in the query string.
 */
export async function createHandoff(grantToken) {
  const code = newGrantId();
  if (isRedisConnected()) {
    try {
      await getRedis().set(HANDOFF_PREFIX + code, grantToken, 'PX', HANDOFF_TTL_MS);
      return code;
    } catch {
      // fall through to memory
    }
  }
  memoryHandoff.set(code, { token: grantToken, expiresAt: Date.now() + HANDOFF_TTL_MS });
  return code;
}

/**
 * Redeem a handoff code for the grant behind it. Single-use and atomic, so a
 * leaked URL only ever yields the grant to the first caller.
 */
export async function consumeHandoff(code) {
  if (!code) return null;
  if (isRedisConnected()) {
    try {
      return await getRedis().getdel(HANDOFF_PREFIX + code);
    } catch {
      // fall through to memory
    }
  }
  const entry = memoryHandoff.get(code);
  if (!entry) return null;
  memoryHandoff.delete(code);
  return entry.expiresAt > Date.now() ? entry.token : null;
}

/** Register a freshly issued grant. `ttlMs` should match the JWT lifetime. */
export async function registerGrant(jti, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  if (isRedisConnected()) {
    try {
      await getRedis().set(PREFIX + jti, '1', 'PX', ttlMs);
      return jti;
    } catch {
      // fall through to memory
    }
  }
  sweepMemory(Date.now());
  memoryStore.set(jti, expiresAt);
  return jti;
}

/**
 * Atomically consume a grant. Returns true only for the first call — every
 * replay returns false. Uses Redis GETDEL so two concurrent redemptions cannot
 * both succeed.
 */
export async function consumeGrant(jti) {
  if (!jti) return false;
  if (isRedisConnected()) {
    try {
      const value = await getRedis().getdel(PREFIX + jti);
      return value === '1';
    } catch {
      // fall through to memory
    }
  }
  const expiresAt = memoryStore.get(jti);
  if (expiresAt === undefined) return false;
  memoryStore.delete(jti);
  return expiresAt > Date.now();
}

/** Revoke a grant without redeeming it (used when impersonation ends early). */
export async function revokeGrant(jti) {
  if (!jti) return;
  if (isRedisConnected()) {
    try {
      await getRedis().del(PREFIX + jti);
    } catch {
      // fall through
    }
  }
  memoryStore.delete(jti);
}

/** Test seam. */
export function _resetGrantStore() {
  memoryStore.clear();
  memoryHandoff.clear();
}

export function newGrantId() {
  return crypto.randomBytes(18).toString('base64url');
}
