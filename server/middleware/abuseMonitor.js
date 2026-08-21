import { trackRequest } from '../services/abuseDetection.js';
import { incrementTenantCounter } from '../config/redis.js';

export function abuseMonitor(req, _res, next) {
  // Track abuse metrics on response finish. Authenticated requests are keyed
  // by tenant (populated by the auth middleware); unauthenticated requests
  // (public auth endpoints, open routes) are keyed by IP so flooding/brute
  // force attempts are visible to the abuse detection cron instead of being
  // invisible.
  _res.once('finish', () => {
    const tenantId = req.user?.tenant;
    if (tenantId) {
      const tid = String(tenantId._id || tenantId);
      trackRequest(tid, _res.statusCode);
      if (_res.statusCode < 400) {
        incrementTenantCounter(tid, 'successful_requests');
      } else if (_res.statusCode < 500) {
        incrementTenantCounter(tid, 'client_errors');
      } else {
        incrementTenantCounter(tid, 'server_errors');
      }
    } else {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      trackRequest(`ip:${ip}`, _res.statusCode);
    }
  });
  next();
}
