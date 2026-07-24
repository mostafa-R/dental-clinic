import { trackRequest } from '../services/abuseDetection.js';
import { incrementTenantCounter, decrementTenantCounter } from '../config/redis.js';

export function abuseMonitor(req, _res, next) {
  // Track tenant abuse metrics using authenticated user (populated by auth middleware
  // before route handlers run). On response finish, req.user will be available for
  // authenticated routes. For unauthenticated routes, no tracking occurs.
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
    }
  });
  next();
}
