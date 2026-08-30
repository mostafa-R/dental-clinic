import crypto from 'node:crypto';
import ApiError from '../utils/ApiError.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF protection for cookie-authenticated requests.
 *
 * Browsers always attach an Origin (and usually a Referer) header to
 * cross-origin POST/PUT/PATCH/DELETE requests. An attacker's site cannot
 * forge these headers, so a mismatch is proof the request is cross-site.
 *
 * Policy:
 * 1. Origin (or Referer) is the PRIMARY control: for state-changing methods,
 *    when a session cookie is present, require Origin/Referer to match an
 *    allowed origin or the API's own origin. A clearly cross-origin request
 *    is always rejected, token or not.
 * 2. A double-submit token (`X-CSRF-Token` header or `_csrf` body field
 *    matching the `_csrf` cookie) is accepted as a fallback ONLY when no
 *    Origin/Referer could be supplied at all (native/privacy clients). The
 *    cookie is host-only + SameSite, so a cross-origin site cannot read it.
 * 3. The `_csrf` cookie is issued lazily on any session-bearing response so
 *    existing clients keep working without a breaking cookie change.
 *
 * Requests without a session cookie (Bearer-only, login, public) are
 * unaffected, and safe methods (GET/HEAD/OPTIONS) always pass.
 */
export function csrfProtection(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return (req, res, next) => {
    const hasSessionCookie = !!(req.cookies?.access_token || req.cookies?.site_access);

    // Issue the double-submit cookie on first session-bearing response.
    if (hasSessionCookie && !req.cookies?._csrf) {
      const token = crypto.randomBytes(24).toString('hex');
      res.cookie('_csrf', token, {
        httpOnly: false,
        sameSite: 'strict',
        secure: req.secure,
        path: '/',
      });
    }

    if (!UNSAFE_METHODS.has(req.method)) return next();
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

    const csrfToken = req.headers['x-csrf-token'] || req.body?._csrf;
    const csrfCookie = req.cookies?._csrf;
    const hasValidDoubleSubmit =
      !!csrfCookie && !!csrfToken && String(csrfCookie) === String(csrfToken);

    if (!source && !hasValidDoubleSubmit) {
      return next(ApiError.forbidden('Cross-origin request blocked: missing Origin/Referer (CSRF protection)'));
    }

    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    if (allowed.has(source) || source === selfOrigin) return next();

    // Origin check stays primary: a cross-origin source is rejected even when
    // a valid token is present. The token only covers the no-source case.
    if (!source && hasValidDoubleSubmit) return next();

    return next(ApiError.forbidden('Cross-origin request blocked (CSRF protection)'));
  };
}
