import SiteAdmin from "../modules/site/admin/admin.model.js";
import ApiError from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Extract client IP from request
 */
function getClientIp(req) {
  return req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

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

    req.siteAdmin = admin;
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

/**
 * Middleware to validate tenant access for site admins.
 * Ensures site admins can only access tenant-scoped data they're authorized for.
 * 
 * Usage:
 *   router.get('/by-tenant/:tenantId', protectSite, requireTenantAccess, getUsersByTenant);
 * 
 * This middleware validates:
 * 1. The tenantId param is a valid ObjectId
 * 2. The tenant exists and is accessible
 * 3. Sets req.targetTenant for downstream use
 */
export async function requireTenantAccess(req, _res, next) {
  try {
    const tenantId = req.params.tenantId || req.params.id || req.body?.tenant;

    if (!tenantId) {
      return next(ApiError.badRequest('Tenant ID is required'));
    }

    // Validate ObjectId format
    const mongoose = await import('mongoose');
    if (!mongoose.isValidObjectId(tenantId)) {
      return next(ApiError.badRequest('Invalid tenant ID format'));
    }

    // Import Tenant model dynamically to avoid circular dependencies
    const Tenant = (await import('../modules/site/tenant/tenant.model.js')).default;

    // Fetch tenant and verify it exists
    const tenant = await Tenant.findById(tenantId).select('_id name status isActive').lean();

    if (!tenant) {
      return next(ApiError.notFound('Tenant not found'));
    }

    // Check if tenant is archived (soft-deleted)
    if (tenant.status === 'archived') {
      return next(ApiError.notFound('Tenant not found'));
    }

    // Attach tenant to request for downstream use
    req.targetTenant = tenant;

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Middleware to validate branch access within tenant scope.
 * Ensures the branch belongs to the specified tenant.
 * 
 * Usage:
 *   router.put('/:id', protectSite, requireBranchAccess, updateBranch);
 */
export async function requireBranchAccess(req, _res, next) {
  try {
    const branchId = req.params.id || req.params.branchId;
    const tenantId = req.params.tenantId || req.body?.tenant || req.targetTenant?._id;

    if (!branchId) {
      return next(ApiError.badRequest('Branch ID is required'));
    }

    // Validate ObjectId format
    const mongoose = await import('mongoose');
    if (!mongoose.isValidObjectId(branchId)) {
      return next(ApiError.badRequest('Invalid branch ID format'));
    }

    // Import Branch model dynamically
    const Branch = (await import('../modules/users/branch.model.js')).default;

    // Fetch branch
    const branch = await Branch.findById(branchId)
      .select('_id name tenant isActive')
      .lean();

    if (!branch) {
      return next(ApiError.notFound('Branch not found'));
    }

    // If tenant context is provided, verify branch belongs to that tenant
    if (tenantId && String(branch.tenant) !== String(tenantId)) {
      // Log potential cross-tenant access attempt
      console.warn({
        event: 'CROSS_TENANT_ACCESS_BLOCKED',
        siteAdmin: req.siteAdmin?._id,
        siteAdminEmail: req.siteAdmin?.email,
        branchId,
        branchTenant: String(branch.tenant),
        requestedTenant: String(tenantId),
        ip: getClientIp(req),
        timestamp: new Date().toISOString()
      });

      return next(ApiError.notFound('Branch not found'));
    }

    // Attach branch to request for downstream use
    req.targetBranch = branch;

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Middleware to validate user access within tenant scope.
 * Ensures the user belongs to the specified tenant.
 */
export async function requireUserAccess(req, _res, next) {
  try {
    const userId = req.params.id || req.params.userId;
    const tenantId = req.params.tenantId || req.targetTenant?._id;

    if (!userId) {
      return next(ApiError.badRequest('User ID is required'));
    }

    // Validate ObjectId format
    const mongoose = await import('mongoose');
    if (!mongoose.isValidObjectId(userId)) {
      return next(ApiError.badRequest('Invalid user ID format'));
    }

    // Import User model dynamically
    const User = (await import('../modules/users/user.model.js')).default;

    // Fetch user
    const user = await User.findById(userId)
      .select('_id name email tenant branch isActive')
      .lean();

    if (!user) {
      return next(ApiError.notFound('User not found'));
    }

    // If tenant context is provided, verify user belongs to that tenant
    if (tenantId && String(user.tenant) !== String(tenantId)) {
      // Log potential cross-tenant access attempt
      console.warn({
        event: 'CROSS_TENANT_ACCESS_BLOCKED',
        siteAdmin: req.siteAdmin?._id,
        siteAdminEmail: req.siteAdmin?.email,
        userId,
        userTenant: String(user.tenant),
        requestedTenant: String(tenantId),
        ip: getClientIp(req),
        timestamp: new Date().toISOString()
      });

      return next(ApiError.notFound('User not found'));
    }

    // Attach user to request for downstream use
    req.targetUser = user;

    return next();
  } catch (err) {
    return next(err);
  }
}
