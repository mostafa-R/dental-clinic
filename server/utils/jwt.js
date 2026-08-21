import jwt from "jsonwebtoken";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
const SITE_ACCESS_COOKIE = "site_access";
export const SITE_REFRESH_COOKIE = "site_refresh";

function secrets() {
  const access = process.env.JWT_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;
  if (!access) throw new Error("JWT_SECRET is not defined in environment");
  if (!refresh)
    throw new Error("JWT_REFRESH_SECRET is not defined in environment");
  return { access, refresh };
}

function accessExpiry() {
  return process.env.ACCESS_TOKEN_EXPIRY || "15m";
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
}

export function clearAuthCookies(res, type = "clinic") {
  if (type === "site") {
    res.clearCookie(SITE_ACCESS_COOKIE, cookieOptions);
    res.clearCookie(SITE_REFRESH_COOKIE, cookieOptions);
  } else {
    res.clearCookie(ACCESS_COOKIE, cookieOptions);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
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
