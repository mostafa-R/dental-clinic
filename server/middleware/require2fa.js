import jwt from 'jsonwebtoken';
import SiteAdmin from '../models/SiteAdmin.js';
import ApiError from '../utils/ApiError.js';

/**
 * Middleware to verify 2FA challenge token and complete login.
 * Used in the 2FA verification endpoint.
 */
export async function require2faChallenge(req, _res, next) {
  try {
    const { challengeToken } = req.validatedBody;
    if (!challengeToken) {
      throw ApiError.unauthorized('2FA challenge token is required');
    }

    let decoded;
    try {
      decoded = jwt.verify(challengeToken, process.env.JWT_SECRET);
    } catch {
      throw ApiError.unauthorized('Invalid or expired challenge token');
    }

    if (decoded.type !== '2fa_challenge') {
      throw ApiError.unauthorized('Invalid token type');
    }

    const admin = await SiteAdmin.findById(decoded.sub);
    if (!admin || !admin.isActive) {
      throw ApiError.unauthorized('Admin not found or disabled');
    }

    req._2faAdmin = admin;
    next();
  } catch (err) {
    next(err);
  }
}
