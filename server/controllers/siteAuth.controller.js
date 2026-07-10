import jwt from "jsonwebtoken";
import SiteAdmin from "../models/SiteAdmin.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  SITE_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { sendSuccess } from "../utils/sendSuccess.js";

// Site admin login
export const siteLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await SiteAdmin.findOne({ email }).select("+password");
  if (!admin) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  if (!admin.isActive) {
    throw ApiError.forbidden("Account is disabled");
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  // Force 2FA for super_admin (mandatory security requirement)
  if (admin.role === 'super_admin' && !admin.twoFactorEnabled) {
    throw ApiError.forbidden('Super admin must enable 2FA before logging in. Contact another super admin or use recovery.');
  }

  // If 2FA is enabled, issue a temporary challenge token instead of full auth
  if (admin.twoFactorEnabled) {
    const challengeToken = jwt.sign(
      { sub: admin._id.toString(), type: "2fa_challenge" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );
    return sendSuccess(res, { requires2fa: true, challengeToken, adminId: admin._id });
  }

  // Update last login
  admin.lastLogin = new Date();
  await admin.save();

  // Set httpOnly cookies
  setAuthCookies(res, admin, "site");

  return sendSuccess(res, { user: admin.toSafeObject() });
});

// Get current site admin
export const getSiteMe = asyncHandler((req, res) => {
  return sendSuccess(res, { user: req.siteAdmin.toSafeObject() });
});

// Refresh access token for site admin
export const siteRefresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[SITE_REFRESH_COOKIE];
  if (!token) {
    throw ApiError.unauthorized("Refresh token missing");
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const admin = await SiteAdmin.findById(decoded.sub);
  if (!admin || !admin.isActive) {
    clearAuthCookies(res, "site");
    throw ApiError.unauthorized("Admin no longer valid");
  }

  if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== admin.tokenVersion) {
    clearAuthCookies(res, "site");
    throw ApiError.unauthorized("Token has been rotated, please log in again");
  }

  admin.tokenVersion = (admin.tokenVersion || 0) + 1;
  await admin.save();

  setAuthCookies(res, admin, "site");

  return sendSuccess(res, { message: "Token refreshed" });
});

// Site admin logout
export const siteLogout = asyncHandler((_req, res) => {
  clearAuthCookies(res, "site");
  return sendSuccess(res, { message: "Logged out" });
});

// Create site admin (only super_admin can do this)
export const createSiteAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const existingAdmin = await SiteAdmin.findOne({ email });
  if (existingAdmin) {
    throw ApiError.conflict("An admin with this email already exists");
  }

  const admin = new SiteAdmin({
    name,
    email,
    password,
    role: role || "support",
  });

  await admin.save();

  return sendSuccess(res, { admin: admin.toSafeObject() }, 201);
});
