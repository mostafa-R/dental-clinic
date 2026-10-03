import axios from "axios";
import { store } from "../app/store";
import { sessionExpired } from "../features/auth/sessionEvents";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_BASE_URL || "http://localhost:7000/api/v1/site",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let queue = [];

/**
 * End the session in the store rather than reloading the document.
 *
 * This used to be `window.location.href = "/login"`. A hard navigation tears
 * down every mounted component at once, so an admin who was halfway through an
 * edit — a tenant form, a 2FA enrolment, an impersonation teardown — lost the
 * input with no warning, and other tabs stayed apparently signed in against a
 * session the server had already revoked. ProtectedRoute watches
 * `isAuthenticated`, so clearing it here produces the same destination with a
 * normal client-side navigation.
 *
 * Guarded against re-entry: the teardown issues its own `/auth/logout` request,
 * which would 401 straight back into this handler.
 */
let sessionTeardownInFlight = false;
function endSession() {
  if (sessionTeardownInFlight) return;
  sessionTeardownInFlight = true;
  try {
    store.dispatch(sessionExpired());
    // Client-readable traces still need clearing; the HttpOnly cookies are gone
    // with the session the server just rejected. Imported lazily to keep this
    // module free of a static cycle through `realtime.js` -> store.
    import("./realtime")
      .then(({ clearClientSessionTraces }) => clearClientSessionTraces())
      .finally(() => {
        sessionTeardownInFlight = false;
      });
  } catch {
    sessionTeardownInFlight = false;
  }
}

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (
      body &&
      typeof body === "object" &&
      body.success === true &&
      Object.prototype.hasOwnProperty.call(body, "data")
    ) {
      response.data = body.data;
    }
    return response;
  },
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") || url.includes("/auth/refresh");

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
        await api.post("/auth/refresh");
        queue.forEach((p) => p.resolve());
        queue = [];
        return api(original);
      } catch (refreshError) {
        queue.forEach((p) => p.reject(refreshError));
        queue = [];
        endSession();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (status === 401 && url.includes("/auth/refresh")) {
      endSession();
    }

    return Promise.reject(error);
  },
);

export default api;
