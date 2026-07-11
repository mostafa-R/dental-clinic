import ErrorLog from '../modules/site/errorLog/errorLog.model.js';

export function logError(err, req, _res, next) {
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    const tenantId = req.tenant?._id || req.params?.tenantId || req.body?.tenantId || null;

    ErrorLog.create({
      tenant: tenantId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      message: err.message?.substring(0, 500) || '',
      stack: (err.stack || '').substring(0, 2000),
      requestId: req.id || null,
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: (req.headers?.['user-agent'] || '').substring(0, 500),
    }).catch((logErr) => console.error('ErrorLog create failed:', logErr.message));
  }

  next(err);
}
