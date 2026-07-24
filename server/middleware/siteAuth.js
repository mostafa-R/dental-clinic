import SiteAdmin from "../modules/site/admin/admin.model.js";
import ApiError from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/jwt.js";

// Protect routes for site admin only
export async function protectSite(req, _res, next) {
  try {
    // Check for token in Authorization header or cookie
    let token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      token = req.cookies?.site_access;
    }

    if (!token) {
      throw ApiError.unauthorized("Not authenticated");
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized("Invalid or expired access token");
    }

    // Verify it's a site admin token
    if (decoded.type !== "site") {
      throw ApiError.unauthorized("Invalid token type");
    }

    const admin = await SiteAdmin.findById(decoded.sub);
    if (!admin) {
      throw ApiError.unauthorized("Admin no longer exists");
    }

    if (!admin.isActive) {
      throw ApiError.forbidden("Account is disabled");
    }

    // Reject revoked tokens (password change, admin-initiated rotation).
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== admin.tokenVersion) {
      throw ApiError.unauthorized("Token revoked — please log in again");
    }

    const safe = admin.toObject();
    delete safe.password;
    delete safe.twoFactorSecret;
    delete safe.twoFactorBackupCodes;
    delete safe.tokenVersion;
    delete safe.__v;
    req.siteAdmin = safe;
    return next();
  } catch (err) {
    return next(err);
  }
}

// Authorize site admin roles
export function authorizeSite(...roles) {
  if (roles.length === 0) {
    throw new Error("authorizeSite() requires at least one role");
  }

  return function authorizeSiteMiddleware(req, _res, next) {
    if (!req.siteAdmin) {
      return next(ApiError.unauthorized("Not authenticated"));
    }

    // Treat "site_admin" as equivalent to the legacy "super_admin"
    const effectiveRole = req.siteAdmin.role === 'site_admin' ? 'super_admin' : req.siteAdmin.role;
    if (!roles.includes(effectiveRole)) {
      return next(
        ApiError.forbidden("You do not have permission to perform this action"),
      );
    }

    return next();
  };
}
