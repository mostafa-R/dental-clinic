import ApiError from '../utils/ApiError.js';
import { logError } from '../utils/logger.js';

/**
 * Enhanced security headers middleware
 * Adds additional security headers beyond what Helmet provides
 */
export function securityHeaders(req, res, next) {
  // X-Content-Type-Options: Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options: Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Referrer-Policy: Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy: Control browser features
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  // X-XSS-Protection (legacy but still useful)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Expect-CT (Certificate Transparency)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Expect-CT', 'max-age=86400, enforce');
  }

  next();
}

/**
 * Request size limiting middleware
 * Prevents excessively large requests
 */
export function requestSizeLimiter(maxSize = '1mb') {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    
    if (contentLength) {
      let maxBytes;
      if (maxSize.endsWith('mb')) {
        maxBytes = parseInt(maxSize) * 1024 * 1024;
      } else if (maxSize.endsWith('kb')) {
        maxBytes = parseInt(maxSize) * 1024;
      } else {
        maxBytes = parseInt(maxSize);
      }
      
      if (contentLength > maxBytes) {
        return next(ApiError.badRequest(`Request too large. Maximum size is ${maxSize}`));
      }
    }
    
    next();
  };
}

/**
 * Security audit logging middleware
 * Logs security-relevant events
 */
export function securityAudit(req, res, next) {
  const originalEnd = res.end.bind(res);
  
  res.end = function(...args) {
    // Log security-relevant events
    if (res.statusCode >= 400 && res.statusCode < 500) {
      // Client errors (potential attacks)
      logError(new Error(`Security event: Client error ${res.statusCode}`), {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        userAgent: req.get('user-agent'),
        userId: req.user?._id,
        timestamp: new Date().toISOString()
      });
    } else if (res.statusCode >= 500) {
      // Server errors (potential issues)
      logError(new Error(`Security event: Server error ${res.statusCode}`), {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
      });
    }
    
    return originalEnd(...args);
  };
  
  next();
}