import api from '../../lib/axios';

// Remove JS-readable session traces on logout. HttpOnly session cookies
// (`access_token`/`refresh_token`) can only be expired by the server, but the
// readable `_csrf` cookie plus any sessionStorage snapshot must be purged
// here so no sensitive data survives client-side — even when the server
// logout call fails.
export function clearClientSessionTraces() {
  try {
    const cookies = typeof document !== 'undefined' && document.cookie ? document.cookie.split(';') : [];
    for (const c of cookies) {
      const name = c.split('=')[0]?.trim();
      if (!name) continue;
      document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
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
  verifyImpersonation: (token) => api.post('/auth/verify-impersonation', { token }).then((r) => r.data.data),
};
