import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const SITE_ACCESS_COOKIE = "site_access";
export const SITE_REFRESH_COOKIE = "site_refresh";
export const CSRF_COOKIE = "_csrf";

// Every cookie that can carry sensitive session data. Logout must expire all
// of them so no JWT / CSRF material survives in the browser after logout.
export const SENSITIVE_COOKIES = [
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  SITE_ACCESS_COOKIE,
  SITE_REFRESH_COOKIE,
  CSRF_COOKIE,
];

function secrets() {
  const access = process.env.JWT_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;
  if (!access) throw new Error("JWT_SECRET is not defined in environment");
  if (!refresh)
    throw new Error("JWT_REFRESH_SECRET is not defined in environment");
  return { access, refresh };
}

function accessExpiry() {
  // PRD §6.1: clinic sessions last up to 12 hours; refresh tokens cover 7 days.
  return process.env.ACCESS_TOKEN_EXPIRY || "12h";
}

function refreshExpiry() {
  return process.env.REFRESH_TOKEN_EXPIRY || "7d";
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function buildPayload(user, type = "clinic", extra = {}) {
  return {
    sub: user._id.toString(),
    roleId: user.roleId ? user.roleId.toString() : null,
    branch: user.branch ? user.branch.toString() : null,
    tokenVersion: user.tokenVersion ?? 0,
    type,
    ...extra,
  };
}

export function signAccessToken(user, type = "clinic", extra = {}) {
  const { access } = secrets();
  return jwt.sign(buildPayload(user, type, extra), access, {
    expiresIn: accessExpiry(),
  });
}

export function signRefreshToken(user, type = "clinic", extra = {}) {
  const { refresh } = secrets();
  return jwt.sign(buildPayload(user, type, extra), refresh, {
    expiresIn: refreshExpiry(),
  });
}

export function verifyAccessToken(token) {
  const { access } = secrets();
  return jwt.verify(token, access);
}

export function verifyRefreshToken(token) {
  const { refresh } = secrets();
  return jwt.verify(token, refresh);
}

export function setAuthCookies(res, user, type = "clinic", extra = {}) {
  const accessToken = signAccessToken(user, type, extra);
  const refreshToken = signRefreshToken(user, type, extra);

  if (type === "site") {
    res.cookie(SITE_ACCESS_COOKIE, accessToken, {
      ...cookieOptions,
      maxAge: msFromExpiry(accessExpiry()),
    });
    res.cookie(SITE_REFRESH_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: msFromExpiry(refreshExpiry()),
    });
  } else {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...cookieOptions,
      maxAge: msFromExpiry(accessExpiry()),
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: msFromExpiry(refreshExpiry()),
    });
  }

  setCsrfCookie(res);
}

export function setCsrfCookie(res) {
  // Double-submit CSRF token, issued alongside the session cookies so it is
  // always available before the first state-changing request. Deliberately
  // NOT httpOnly (the client must read it and echo it back) but host-only +
  // SameSite, so a cross-origin site cannot read it either.
  if (!res._csrfIssued) {
    res._csrfIssued = true;
    const token = crypto.randomBytes(24).toString("hex");
    res.cookie("_csrf", token, {
      httpOnly: false,
      sameSite: "strict",
      secure: res.req?.secure ?? process.env.NODE_ENV === "production",
      path: "/",
    });
  }
}

export function clearAuthCookies(res, _type = "clinic") {
  // Always expire every sensitive cookie regardless of realm: a browser may
  // hold clinic + site cookies at once (e.g. "login as" / impersonation
  // flows), and leaving any of them behind keeps session material alive
  // after logout. `_type` is kept for backward compatibility but ignored.
  res.clearCookie(ACCESS_COOKIE, cookieOptions);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.clearCookie(SITE_ACCESS_COOKIE, cookieOptions);
  res.clearCookie(SITE_REFRESH_COOKIE, cookieOptions);
  const csrfClearOptions = {
    httpOnly: false,
    sameSite: "strict",
    secure: res.req?.secure ?? process.env.NODE_ENV === "production",
    path: "/",
  };
  res.clearCookie(CSRF_COOKIE, csrfClearOptions);
  // Defensive: also expire with the flipped `secure` flag so the cookie is
  // removed even when the logout request arrives over a different scheme
  // (http vs https) than the login that set it.
  res.clearCookie(CSRF_COOKIE, {
    ...csrfClearOptions,
    secure: !csrfClearOptions.secure,
  });
  // Belt-and-suspenders: overwrite HttpOnly session cookies with an
  // immediately-expired empty value (correct path + flags) in case an
  // intermediary strips one of the `Set-Cookie: Expires=1970` headers above.
  for (const name of [
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    SITE_ACCESS_COOKIE,
    SITE_REFRESH_COOKIE,
  ]) {
    res.cookie(name, "", {
      ...cookieOptions,
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

const EXPIRY_MULTIPLIERS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const EXPIRY_PATTERN = /^(\d+)([smhdw])$/;

/**
 * Parse a `<n><unit>` duration (`30s`, `15m`, `1h`, `7d`, `2w`).
 *
 * A malformed value used to fall back to 24h, which meant a typo in
 * ACCESS_TOKEN_EXPIRY (e.g. `1H`, `60 m`, `1hour`) silently produced a token
 * valid for a full day instead of failing. Throwing is the safe direction: an
 * unset variable still takes the documented default, but a value the operator
 * clearly intended to set is rejected loudly rather than reinterpreted.
 * `validateEnv()` calls this at boot so the failure happens on startup, not on
 * the first login.
 */
export function msFromExpiry(expiry, label = "token expiry") {
  if (typeof expiry !== "string") {
    throw new Error(`Invalid ${label}: expected a string like "15m" or "12h", got ${typeof expiry}`);
  }
  const match = expiry.trim().match(EXPIRY_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid ${label} "${expiry}": expected <number><s|m|h|d|w>, e.g. "30s", "15m", "12h", "7d"`,
    );
  }
  const value = Number(match[1]);
  const ms = value * EXPIRY_MULTIPLIERS[match[2]];
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new Error(`Invalid ${label} "${expiry}": duration must resolve to a positive millisecond value`);
  }
  return ms;
}

/** Resolve a configured expiry, applying `fallback` only when unset. */
export function resolveExpiryMs(value, fallback, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return msFromExpiry(fallback, `${label} default`);
  }
  return msFromExpiry(value, label);
}
