import { trackRequest } from '../services/abuseDetection.js';
import { incrementTenantCounter } from '../config/redis.js';

export function abuseMonitor(req, _res, next) {
  const tenantId = req.user?.tenant || req.query?.tenantId || req.params?.tenantId;

  if (tenantId) {
    const tid = String(tenantId._id || tenantId);
    _res.once('finish', () => {
      trackRequest(tid, _res.statusCode);
      incrementTenantCounter(tid, 'active_requests');
      if (_res.statusCode < 400) {
        incrementTenantCounter(tid, 'successful_requests');
      } else if (_res.statusCode < 500) {
        incrementTenantCounter(tid, 'client_errors');
      } else {
        incrementTenantCounter(tid, 'server_errors');
      }
    });
  }
  next();
}
