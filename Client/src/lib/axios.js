import axios from 'axios';
import { disconnectSocket } from './socket';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

let isRefreshing = false;
let queue = [];

function redirectToLogin() {
  disconnectSocket();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

/**
 * Decide whether a failed token refresh should end the session.
 *
 * Only a 401/403 from the server means the token was genuinely rejected. A
 * dropped connection, DNS failure, CORS block or timeout rejects with no
 * `response` at all, and treating those as an expired session logs the user out
 * over a transient blip and throws away a still-valid session.
 *
 * Exported so this decision is directly testable.
 */
export function shouldEndSession(refreshError) {
  const status = refreshError?.response?.status;
  return status === 401 || status === 403;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Silent probes (public pages like Pricing) must never trigger a
    // refresh attempt or a hard redirect to /login — just reject so the
    // caller can stay on the public page.
    if (original?._silent) {
      return Promise.reject(error);
    }
    const status = error.response?.status;
    const url = original?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        })
          .then(() => api(original))
          .catch((e) => Promise.reject(e));
      }

      original._retry = true;
      isRefreshing = true;
      try {
        await api.post('/auth/refresh');
        queue.forEach((p) => p.resolve());
        queue = [];
        return api(original);
      } catch (refreshError) {
        queue.forEach((p) => p.reject(refreshError));
        queue = [];
        // Only end the session when the server actually rejected the token.
        // A dropped connection, DNS failure, or timeout also lands in this
        // catch — with no `response` at all — and logging out on those threw
        // away a still-valid session over a transient Wi-Fi blip. The queued
        // requests are rejected either way, and the next user action will try
        // the refresh again once connectivity returns.
        if (shouldEndSession(refreshError)) {
          redirectToLogin();
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 401 && url.includes('/auth/refresh')) {
      redirectToLogin();
    }

    // Plan gate denied: the tenant's subscription changed (downgrade /
    // reassignment) while the user is logged in with stale Redux perms.
    // Refresh effective permissions so the sidebar and the route guard hide the
    // module immediately instead of after logout/login. Throttled via
    // _planRefreshed flag to avoid refresh loops on repeated 403s.
    if (status === 403 && !original?._planRefreshed) {
      const msg = error.response?.data?.message || '';
      if (msg.includes('plan does not include')) {
        original._planRefreshed = true;
        try {
          const [{ store }] = await Promise.all([import('../app/store')]);
          const st = store.getState()?.users?.permissionsStatus;
          if (st !== 'loading') {
            const { fetchMyPermissions } = await import('../features/users/userSlice');
            store.dispatch(fetchMyPermissions());
          }
        } catch {
          /* best-effort — never block the original 403 from reaching the UI */
        }
      }
    }

    return Promise.reject(error);
  },
);

export default api;
