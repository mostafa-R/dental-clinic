import ErrorLog from '../models/ErrorLog.js';

export function logError(err, req, _res, next) {
  if (err.statusCode >= 400) {
    const tenantId = req.tenant?._id || req.params?.tenantId || req.body?.tenantId || null;

    ErrorLog.create({
      tenant: tenantId,
      method: req.method,
      url: req.originalUrl,
      statusCode: err.statusCode || 500,
      message: err.message?.substring(0, 500) || '',
      stack: (err.stack || '').substring(0, 2000),
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: (req.headers?.['user-agent'] || '').substring(0, 500),
    }).catch((logErr) => console.error('ErrorLog create failed:', logErr.message));
  }

  next(err);
}
