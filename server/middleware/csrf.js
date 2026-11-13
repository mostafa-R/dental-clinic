import crypto from 'node:crypto';
import ApiError from '../utils/ApiError.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Login/impersonation/refresh are cookie-issuing auth flows and must be
// protected against cross-site requests even before a session cookie exists.
const CSRF_PROTECTED_NO_SESSION_PATHS = new Set([
  '/api/auth/login',
  '/api/v1/auth/login',
  '/api/site/auth/login',
  '/api/v1/site/auth/login',
  '/api/v1/site/2fa/verify-login',
  '/api/auth/refresh',
  '/api/v1/auth/refresh',
  '/api/site/auth/refresh',
  '/api/v1/site/auth/refresh',
  '/api/auth/verify-impersonation',
  '/api/v1/auth/verify-impersonation',
]);

export const CSRF_COOKIE_CONFIG = {
  httpOnly: false,
  sameSite: 'strict',
  secure: false, // resolved at runtime via req.secure
  path: '/',
};

function csrfCookieOptions(req) {
  return {
    ...CSRF_COOKIE_CONFIG,
    secure: req.secure,
  };
}

function normalizeOriginLike(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === 'null' ? null : url.origin;
  } catch {
    return null;
  }
}

/**
 * CSRF protection for cookie-authenticated and cookie-issuing auth requests.
 *
 * Browsers attach Origin (or Referer) on state-changing requests. For session
 * cookie requests, Origin/Referer is primary and a valid double-submit token is
 * accepted only when no source is available. For selected auth endpoints that
 * issue/rotate cookies before a session cookie exists (login/refresh/
 * impersonation verification), Origin/Referer must identify an allowed origin.
 */
export function csrfProtection(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return (req, res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const hasSessionCookie = !!(req.cookies?.access_token || req.cookies?.site_access);

    // Issue the double-submit cookie on first session-bearing response.
    // Respect a cookie already issued this response via setAuthCookies.
    if (hasSessionCookie && !req.cookies?._csrf && !res._csrfIssued) {
      const token = crypto.randomBytes(24).toString('hex');
      res._csrfIssued = true;
      res.cookie('_csrf', token, csrfCookieOptions(req));
    }

    const source = normalizeOriginLike(req.headers.origin) || normalizeOriginLike(req.headers.referer);
    const selfOrigin = `${req.protocol}://${req.get('host')}`;

    if (!hasSessionCookie) {
      // Protect cookie-issuing auth flows (e.g. login) from cross-site POSTs.
      if (!CSRF_PROTECTED_NO_SESSION_PATHS.has(req.path)) return next();
      if (!source) {
        return next(ApiError.forbidden('Cross-origin request blocked: missing Origin/Referer (CSRF protection)'));
      }
      if (allowed.has(source) || source === selfOrigin) return next();
      return next(ApiError.forbidden('Cross-origin request blocked (CSRF protection)'));
    }

    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;
    const csrfCookie = req.cookies?._csrf;
    const hasValidDoubleSubmit =
      !!csrfCookie && !!csrfToken && String(csrfCookie) === String(csrfToken);

    if (!source && !hasValidDoubleSubmit) {
      return next(ApiError.forbidden('Cross-origin request blocked: missing Origin/Referer (CSRF protection)'));
    }

    if (source && (allowed.has(source) || source === selfOrigin)) return next();

    // Origin check stays primary: a cross-origin source is rejected even when
    // a valid token is present. The token only covers the no-source case.
    if (!source && hasValidDoubleSubmit) return next();

    return next(ApiError.forbidden('Cross-origin request blocked (CSRF protection)'));
  };
}