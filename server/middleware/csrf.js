import ApiError from '../utils/ApiError.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection for cookie-authenticated requests.
 *
 * Browsers always attach an Origin (and usually a Referer) header to
 * cross-origin POST/PUT/PATCH/DELETE requests. An attacker's site cannot
 * forge these headers, so a mismatch is proof the request is cross-site.
 *
 * Policy: for state-changing methods, when a session cookie is present,
 * require Origin (or Referer) to match an allowed origin or the API's own
 * origin. Requests without a session cookie (Bearer-only, login, public)
 * are unaffected, and safe methods (GET/HEAD/OPTIONS) always pass.
 */
export function csrfProtection(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();

    const hasSessionCookie = !!(req.cookies?.access_token || req.cookies?.site_access);
    if (!hasSessionCookie) return next();

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    const normalize = (value) => {
      if (!value) return null;
      try {
        const url = new URL(value);
        return url.origin === 'null' ? null : url.origin;
      } catch {
        return null;
      }
    };

    const source = normalize(origin) || normalize(referer);
    if (!source) {
      return next(ApiError.forbidden('Cross-origin request blocked: missing Origin/Referer (CSRF protection)'));
    }

    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    if (allowed.has(source) || source === selfOrigin) return next();

    return next(ApiError.forbidden('Cross-origin request blocked (CSRF protection)'));
  };
}
