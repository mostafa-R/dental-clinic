import ApiError from '../utils/ApiError.js';

/**
 * Host policy middleware.
 *
 * Two concerns:
 * 1. X-Forwarded-Host spoofing. With `app.set('trust proxy', 1)` Express
 *    trusts a single hop of forwarded headers, so a client that hits the
 *    origin directly can forge `<clinic>.dentalos.app` in X-Forwarded-Host.
 *    When a `TRUSTED_PROXY_IP` allow-list is configured, forwarded Host /
 *    proto headers are only honored from that proxy; any other peer's
 *    forwarded headers are dropped so `req.hostname` falls back to the real
 *    Host/SNI header. When no allow-list is configured the previous single-hop
 *    behavior is kept (the Origin check in CSRF and the cross-tenant check in
 *    protect remain the backstops).
 * 2. Strict hostname allow-list. Any host that is neither a subdomain of the
 *    app domain, a configured extra host, nor localhost/bare-IP (health
 *    checks) is rejected outright.
 *    At the proxy, also strip/replace X-Forwarded-* before forwarding, and
 *    prefer matching on the connector's SNI / server_name.
 */

const APP_DOMAIN = (process.env.APP_DOMAIN || 'dentalos.app').toLowerCase();
const EXTRA_HOSTS = (process.env.ALLOWED_EXTRA_HOSTS || '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_IP || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isTrustedProxy(remoteAddress) {
  if (!TRUSTED_PROXY_IPS.length) return true;
  if (!remoteAddress) return false;
  const normalized = remoteAddress.replace(/^\[|\]$/g, '').replace(/:\d+$/, '');
  return TRUSTED_PROXY_IPS.includes(remoteAddress) || TRUSTED_PROXY_IPS.includes(normalized);
}

export function hostPolicy(req, _res, next) {
  if (!isTrustedProxy(req.socket?.remoteAddress)) {
    delete req.headers['x-forwarded-host'];
    delete req.headers['x-forwarded-proto'];
  }

  const hostname = String(req.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost') return next();

  const isBareIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === '::1';
  if (isBareIp) return next();
  if (hostname === APP_DOMAIN || hostname.endsWith(`.${APP_DOMAIN}`)) return next();
  if (EXTRA_HOSTS.includes(hostname)) return next();

  return next(ApiError.badRequest('Unrecognized Host header'));
}