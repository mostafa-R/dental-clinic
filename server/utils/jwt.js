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

function msFromExpiry(expiry) {
  if (typeof expiry !== "string") return 86400000;
  const match = expiry.match(/^(\d+)([smhdw])$/);
  if (!match) return 86400000;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * multipliers[unit];
}
