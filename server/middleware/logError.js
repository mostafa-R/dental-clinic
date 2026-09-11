import ErrorLog from '../modules/site/errorLog/errorLog.model.js';

const SENSITIVE_PATTERNS = [
  /password['":\s]*[=:>]+[^\s,;)}\]]{3,}/gi,
  /token['":\s]*[=:>]+[^\s,;)}\]]{10,}/gi,
  /secret['":\s]*[=:>]+[^\s,;)}\]]{6,}/gi,
  /authorization['":\s]*[=:>]+[^\s,;)}\]]{10,}/gi,
  /cookie['":\s]*[=:>]+[^\s,;)}\]]{10,}/gi,
  /jwt[_\s]*secret['":\s]*[=:>]+[^\s,;)}\]]{6,}/gi,
];

function redactSensitive(text) {
  if (!text) return '';
  return SENSITIVE_PATTERNS.reduce(
    (t, pattern) => t.replace(pattern, (m) => {
      const eqIdx = m.search(/[=:>]/);
      if (eqIdx === -1) return '[REDACTED]';
      return m.slice(0, eqIdx + 1) + ' [REDACTED]';
    }),
    text,
  );
}

export function logError(err, req, _res, next) {
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    const tenantId = req.tenant?._id || null;

    ErrorLog.create({
      tenant: tenantId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      message: redactSensitive(err.message?.substring(0, 500) || ''),
      stack: redactSensitive((err.stack || '').substring(0, 2000)),
      requestId: req.id || null,
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: (req.headers?.['user-agent'] || '').substring(0, 500),
    }).catch((logErr) => console.error('ErrorLog create failed:', logErr.message));
  }

  next(err);
}
