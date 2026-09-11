import { appendAuditLog } from '../utils/auditChain.js';

/**
 * Shared audit writer. Link entries to the previous one (tamper-evident
 * chain) and wait for the write so failures surface in the logs instead of
 * silently dropping the record (H3).
 */
async function writeAudit(entry) {
  try {
    await appendAuditLog(entry);
  } catch (err) {
    console.error('[Audit] Failed to persist audit record:', err.message, {
      action: entry.action,
      requestId: entry.requestId,
    });
  }
}

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

        void writeAudit({
          admin: req.siteAdmin._id,
          tenantActor: null,
          scope: 'site',
          adminEmail: req.siteAdmin.email,
          adminRole: req.siteAdmin.role,
          action,
          target: targetId
            ? { type: targetType, id: targetId, name: targetName }
            : undefined,
          details,
          requestId: req.id || null,
          ip: req.ip || req.headers?.['x-forwarded-for'] || '',
          userAgent: (req.headers?.['user-agent'] || '').substring(0, 500),
        });
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Persist a tenant-realm audit event (performed by a clinic user inside their
 * clinic): role changes, password resets, deactivation, branch deletion (H4).
 * Call it from the controller after the operation succeeds.
 *
 * Usage:
 *   await auditTenantAction(req, 'user.role_change', { type: 'user', id, name });
 */
export async function auditTenantAction(req, action, target, details = {}) {
  const actor = req.user;
  if (!actor) return;

  await writeAudit({
    admin: null,
    tenantActor: actor._id,
    scope: 'tenant',
    adminEmail: '',
    adminRole: '',
    action,
    target,
    details,
    requestId: req.id || null,
    ip: req.ip || req.headers?.['x-forwarded-for'] || '',
    userAgent: (req.headers?.['user-agent'] || '').substring(0, 500),
  });
}