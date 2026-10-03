import api from '../../lib/axios';

// Cookies this app actually sets, mirroring `SENSITIVE_COOKIES` in
// `server/utils/jwt.js`. Only these are expired on logout.
//
// The previous version looped over every cookie in `document.cookie` and
// expired all of them. That reaches outside this app: any cookie a third-party
// embed or another app set on the same origin was destroyed on logout, which is
// a destructive side effect on state this module does not own - and it silently
// logged the user out of sibling apps sharing the host.
//
// The session cookies are HttpOnly and cannot be read or expired from JS; they
// are listed for defensiveness (a cookie set without HttpOnly by a future
// change would otherwise survive) and are expired by the server regardless.
const OWNED_COOKIES = ['access_token', 'refresh_token', 'site_access', 'site_refresh', '_csrf'];

// Remove JS-readable session traces on logout. HttpOnly session cookies
// (`access_token`/`refresh_token`) can only be expired by the server, but the
// readable `_csrf` cookie plus any sessionStorage snapshot must be purged
// here so no sensitive data survives client-side — even when the server
// logout call fails.
export function clearClientSessionTraces() {
  try {
    if (typeof document !== 'undefined') {
      for (const name of OWNED_COOKIES) {
        document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
      }
    }
  } catch {
    /* non-browser or CSP-blocked — server already expired HttpOnly cookies */
  }
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data.data),
  logout: () => api.post('/auth/logout').then((r) => r.data.data),
  refresh: () => api.post('/auth/refresh').then((r) => r.data.data),
  getMe: () => api.get('/auth/me').then((r) => r.data.data),
  // Silent variant for public pages: never triggers the login redirect.
  getMeSilent: () => api.get('/auth/me', { _silent: true }).then((r) => r.data.data),
  // `code` is the 60-second single-use handoff code, not the grant itself.
  verifyImpersonation: (code) => api.post('/auth/verify-impersonation', { code }).then((r) => r.data.data),
};
