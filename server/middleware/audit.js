import AuditLog from '../models/AuditLog.js';

/**
 * Middleware factory that logs an audit trail entry after the response is sent.
 *
 * Usage:
 *   router.put('/:id/suspend', protectSite, audit('tenant.suspend', 'tenant'), suspendTenant);
 *
 * Inside a controller you can also attach extra detail via req.auditDetails.
 */
export function audit(action, targetType) {
  return function auditMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const statusOk = res.statusCode >= 200 && res.statusCode < 300;

      if (statusOk && req.siteAdmin) {
        const targetId = req.params?.id || req.body?._id;
        const targetName = req.auditTargetName || req.body?.name || req.body?.email || '';

        let details = { ...(req.auditDetails || {}) };
        if (req.method === 'POST' && body?.data?._id) {
          details.createdId = String(body.data._id);
        }

        AuditLog.create({
          admin: req.siteAdmin._id,
          adminEmail: req.siteAdmin.email,
          adminRole: req.siteAdmin.role,
          action,
          target: targetId
            ? { type: targetType, id: targetId, name: targetName }
            : undefined,
          details,
          ip: req.ip || req.headers?.['x-forwarded-for'] || '',
          userAgent: (req.headers?.['user-agent'] || '').substring(0, 500),
        }).catch((err) => console.error('Audit log error:', err.message));
      }

      return originalJson(body);
    };

    next();
  };
}
