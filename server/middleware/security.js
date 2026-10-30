import ApiError from '../utils/ApiError.js';
import { logErrorData, logWarn } from '../utils/logger.js';

// Every API response carries either user data, session state (cookies), or
// auth material. Without an explicit policy, browsers can keep authenticated
// GET responses in the back/forward cache and any shared cache in front may
// retain PHI by heuristic. Documents and static assets (Swagger UI) are
// excluded so their assets stay cacheable.
const API_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
};

/**
 * Enhanced security headers middleware
 * Adds additional security headers beyond what Helmet provides
 */
export function securityHeaders(req, res, next) {
  // X-Content-Type-Options: Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options: Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Referrer-Policy: Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy: Control browser features
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  // Cache policy for API responses (PHI + session state must never live in
  // browser bfcaches or shared caches). X-XSS-Protection and Expect-CT were
  // removed: X-XSS-Protection has been inert in all evergreen browsers since
  // Chrome 78 / Firefox 70, and Expect-CT was retired entirely (Chrome 106)
  // — both are pure response noise now.
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', API_CACHE_HEADERS['Cache-Control']);
    res.setHeader('Pragma', API_CACHE_HEADERS.Pragma);
  }

  next();
}

/**
 * Request size limiting middleware
 * Prevents excessively large requests
 */
export function requestSizeLimiter(maxSize = '1mb') {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'], 10);

    if (contentLength) {
      const maxBytes = parseSizeBytes(maxSize);
      if (contentLength > maxBytes) {
        return next(ApiError.badRequest(`Request too large. Maximum size is ${maxSize}`));
      }
    }

    next();
  };
}

function parseSizeBytes(size) {
  if (size.endsWith('mb')) return parseInt(size, 10) * 1024 * 1024;
  if (size.endsWith('kb')) return parseInt(size, 10) * 1024;
  return parseInt(size, 10);
}

// Upload endpoints accept large multipart bodies (Xray scans, PDFs, photos).
// Every other endpoint is JSON/urlencoded with a strict 1mb parser limit —
// giving the whole API a 55mb Content-Length allowance puts blast radius in
// the wrong place: any future parser relaxation would inherit it. This
// limiter applies the large allowance only to the upload route prefixes
// (the v1 router is mounted at both "/" and "/v1" in routes/routes.js, so
// both spellings must be covered) and 1mb to everything else.
const UPLOAD_MAX_BYTES = parseSizeBytes('55mb');
const DEFAULT_MAX_BYTES = parseSizeBytes('1mb');

export function uploadAwareBodyLimiter(req, res, next) {
  const isUploadPath =
    req.originalUrl.startsWith('/api/v1/emr/attachments') ||
    req.originalUrl.startsWith('/api/emr/attachments');
  const maxBytes = isUploadPath ? UPLOAD_MAX_BYTES : DEFAULT_MAX_BYTES;

  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength && contentLength > maxBytes) {
    return next(ApiError.badRequest('Request too large'));
  }

  next();
}

// 4xx classes worth recording as security events. Routine 404s are traffic
// noise (httpLogger already records them); every one of these is either an
// auth failure, an authorization failure, or rate-limit tripping — probe
// patterns worth keeping an eye on.
const AUDITED_4XX = new Set([401, 403, 429]);

/**
 * Security audit logging middleware
 *
 * Logs security-relevant responses WITHOUT constructing an Error object.
 * The previous version monkey-patched `res.end` and built a stack-capturing
 * Error per failing request at error level, which buried real incidents
 * under routine 401/404/429 noise and paid a stack-capture cost on hot
 * paths. `res.on("finish")` needs no patching, and `logErrorData` logs
 * structured fields only.
 */
export function securityAudit(req, res, next) {
  res.on('finish', () => {
    const status = res.statusCode;
    if (status < 400) return;

    const context = {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      statusCode: status,
      userAgent: req.get('user-agent'),
      userId: req.user?._id,
    };

    if (status >= 500) {
      logErrorData(`Server error ${status}`, context);
    } else if (AUDITED_4XX.has(status)) {
      logWarn(`Security event: ${status}`, context);
    }
  });

  next();
}
