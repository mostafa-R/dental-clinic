import ApiError from '../utils/ApiError.js';
import { cacheDel, cacheGet, cacheSet } from '../utils/cache.js';
import PlatformSetting from '../modules/platform/platformSetting.model.js';

const TTL_MS = 30 * 1000;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let cachedAllow = null;
let cachedAt = 0;

/**
 * Drop the in-memory + Redis allowlist cache so the next request re-reads it.
 * Called from platformSetting.service when the setting is updated.
 */
export async function clearIpAllowlistCache() {
  cachedAllow = null;
  cachedAt = 0;
  await cacheDel('platform', 'siteIpAllowlist');
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return null;
  }
  return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
}

function ipv6ToBigInt(ip) {
  const noZone = ip.split('%')[0];
  const parts = noZone.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const all = head.concat(tail);
  if (all.some((g) => !/^[0-9a-fA-F]{0,4}$/.test(g))) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail].map((g) =>
    (g || '0').padStart(4, '0'),
  );
  return BigInt('0x' + groups.join(''));
}

function parseRule(rule) {
  const r = String(rule).trim();
  if (!r) return null;

  const [addr, prefixRaw] = r.split('/');
  if (prefixRaw === undefined) {
    const v4 = ipv4ToInt(addr);
    if (v4 !== null) return { v4: true, ip: v4, prefix: 32 };
    const v6 = ipv6ToBigInt(addr);
    if (v6 !== null) return { v6: true, ip: v6, prefix: 128 };
    return null;
  }

  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix)) return null;

  if (addr.includes(':')) {
    const v6 = ipv6ToBigInt(addr);
    if (v6 === null || prefix < 0 || prefix > 128) return null;
    return { v6: true, ip: v6, prefix };
  }

  const v4 = ipv4ToInt(addr);
  if (v4 === null || prefix < 0 || prefix > 32) return null;
  return { v4: true, ip: v4, prefix };
}

function matches(allow, ip) {
  return allow.some((rule) => {
    if (rule.v4 && ip.isV4 && ip.v4 !== null) {
      if (rule.prefix === 0) return true;
      const shift = 32 - rule.prefix;
      return (ip.v4 >>> shift) === (rule.ip >>> shift);
    }
    if (rule.v6 && ip.isV6 && ip.v6 !== null) {
      const shift = BigInt(128 - rule.prefix);
      return (ip.v6 >> shift) === (rule.ip >> shift);
    }
    return false;
  });
}

async function loadAllowlist() {
  const envList = (process.env.ALLOWED_SITE_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const cached = await cacheGet('platform', 'siteIpAllowlist');
  let settingsList = [];
  if (cached !== null && cached !== undefined) {
    settingsList = cached;
  } else {
    const doc = await PlatformSetting.findOne().select('allowedSiteIps').lean();
    const raw = doc?.allowedSiteIps || '';
    settingsList = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await cacheSet('platform', 'siteIpAllowlist', settingsList, 30);
  }

  return [...envList, ...settingsList].map(parseRule).filter(Boolean);
}

function clientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  return String(raw).replace(/^::ffff:/, '');
}

/**
 * Restrict write access to the site-admin panel to a configured IP allowlist.
 *
 * Sources: env `ALLOWED_SITE_IPS` (comma-separated IPs/CIDRs) merged with the
 * runtime `allowedSiteIps` platform setting. When no rule is configured the
 * allowlist is disabled. Login/2FA flows and read-only (GET) requests always
 * pass so a misconfiguration cannot lock admins out entirely.
 */
export async function ipAllowlist(req, _res, next) {
  const path = req.path;

  if (!path.startsWith('/site')) return next();
  if (!WRITE_METHODS.has(req.method)) return next();
  if (path.startsWith('/site/auth/') || path.startsWith('/site/2fa/')) {
    return next();
  }

  if (Date.now() - cachedAt > TTL_MS) cachedAllow = null;
  if (!cachedAllow) cachedAllow = await loadAllowlist();

  if (cachedAllow.length === 0) return next();

  const normalized = clientIp(req);
  const isV4 = normalized.includes('.');
  const ip = isV4
    ? { isV4: true, v4: ipv4ToInt(normalized) }
    : { isV6: true, v6: ipv6ToBigInt(normalized) };

  if ((ip.v4 === null && ip.v6 === null) || !matches(cachedAllow, ip)) {
    return next(ApiError.forbidden('Forbidden'));
  }

  return next();
}
