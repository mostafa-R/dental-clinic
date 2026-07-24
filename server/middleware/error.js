import ApiError from '../utils/ApiError.js';
import { logError } from '../utils/logger.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = err.message || 'Validation failed';
    details = Object.entries(err.errors).reduce((acc, [key, val]) => {
      acc[key] = val.message || val.kind || 'Invalid value';
      return acc;
    }, {});
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate value';
    details = Object.keys(err.keyValue).reduce((acc, key) => {
      acc[key] = 'Already exists';
      return acc;
    }, {});
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid value';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large. Maximum size is 20MB';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    } else {
      message = err.message || 'Upload error';
    }
  }

  if (statusCode >= 500 && !(err instanceof ApiError)) {
    logError(err, {
      url: _req.originalUrl,
      method: _req.method,
      requestId: _req.id,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(process.env.NODE_ENV !== 'production' && statusCode >= 500 && !(err instanceof ApiError)
      ? { stack: err.stack }
      : {}),
  });
}
