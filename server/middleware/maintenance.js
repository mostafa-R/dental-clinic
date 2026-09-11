import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { cacheDel, cacheGet, cacheSet } from '../utils/cache.js';
import PlatformSetting from '../modules/platform/platformSetting.model.js';

const TTL_MS = 30 * 1000;

let cachedMaintenance = null;
let cachedAt = 0;

/**
 * Drop the in-memory + Redis maintenance flag so the next request re-reads it.
 * Called from platformSetting.service when the flag is toggled.
 */
export async function clearMaintenanceCache() {
  cachedMaintenance = null;
  cachedAt = 0;
  await cacheDel('platform', 'maintenance');
}

async function isMaintenanceMode() {
  if (cachedMaintenance !== null && Date.now() - cachedAt < TTL_MS) {
    return cachedMaintenance;
  }

  try {
    const cached = await cacheGet('platform', 'maintenance');
    if (cached !== null && cached !== undefined) {
      cachedMaintenance = !!cached;
    } else {
      const doc = await PlatformSetting.findOne().select('maintenanceMode').lean();
      cachedMaintenance = !!doc?.maintenanceMode;
      await cacheSet('platform', 'maintenance', cachedMaintenance, 30);
    }
    cachedAt = Date.now();
    return cachedMaintenance;
  } catch {
    // Fail closed: if the maintenance flag cannot be read (Redis and/or the
    // platform DB are unavailable), assume the platform IS under maintenance.
    // Serving half-initialized state to clinics is worse than a short 503,
    // and the always-allowed health / site-auth paths remain reachable.
    cachedMaintenance = true;
    cachedAt = Date.now();
    console.error(
      '[Maintenance] Could not read maintenance flag (Redis/DB down) — ' +
        'fail-closed: blocking non-whitelisted traffic.',
    );
    return true;
  }
}

function hasValidSiteAdminToken(req) {
  const token =
    req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.cookies?.site_access;
  if (!token) return false;
  try {
    const decoded = verifyAccessToken(token);
    return decoded?.type === 'site';
  } catch {
    return false;
  }
}

/**
 * Global maintenance gate.
 *
 * When the platform's maintenanceMode flag is on, only health checks, the
 * site admin auth/2FA flows, and requests carrying a valid site-admin token
 * are served. Everything else (clinic users, anonymous API calls) receives
 * 503 so a deploy does not serve half-initialized state to clinics.
 */
export async function maintenance(req, _res, next) {
  // req.path is relative to the /api mount, so versioned routes show up as
  // /v1/site/... Normalize the /v1 prefix away so the whitelist matches both
  // the canonical (/api/v1/site/...) and alias (/api/site/...) forms.
  const path = req.path.replace(/^\/v1(?=\/|$)/, '');

  const alwaysAllowed =
    path === '/health' ||
    path === '/site/health' ||
    path.startsWith('/site/auth/') ||
    path.startsWith('/site/2fa/');

  if (alwaysAllowed) return next();

  const on = await isMaintenanceMode();
  if (!on) return next();

  if (hasValidSiteAdminToken(req)) return next();

  return next(
    ApiError.serviceUnavailable(
      'System is under maintenance. Please try again later.',
    ),
  );
}
