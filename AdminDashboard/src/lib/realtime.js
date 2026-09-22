import { io } from "socket.io-client";

let socket = null;

// Singleton site-admin socket. Auth travels in the `site_access` cookie
// (withCredentials), so no token handling is needed here. Returns null when
// socket.io cannot be constructed — callers must fall back to polling.
export function getSiteSocket() {
  if (socket) return socket;
  try {
    const apiBase =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:7000/api/v1/site";
    const url =
      import.meta.env.VITE_SOCKET_URL || apiBase.replace(/\/api\/.*$/, "");
    socket = io(url, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socket.on("connect_error", () => {
      /* silent — polling fallback keeps the UI fresh */
    });
    return socket;
  } catch {
    return null;
  }
}

export function disconnectSiteSocket() {
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {
      /* ignore disconnect errors during logout */
    }
    socket = null;
  }
}

// Remove JS-readable session traces on logout. HttpOnly session cookies
// (`site_access`/`site_refresh`, `access_token`/`refresh_token`) can only be
// expired by the server, but the readable `_csrf` cookie plus any
// sessionStorage snapshot must be purged here so no sensitive data survives
// client-side — even when the server logout call fails.
export function clearClientSessionTraces() {
  try {
    const cookies = document.cookie ? document.cookie.split(";") : [];
    for (const c of cookies) {
      const name = c.split("=")[0]?.trim();
      if (!name) continue;
      document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
    }
  } catch {
    /* non-browser or CSP-blocked — server already expired HttpOnly cookies */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}
