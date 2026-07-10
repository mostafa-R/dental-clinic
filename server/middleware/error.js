import ApiError from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    details = Object.keys(err.errors);
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate value';
    details = Object.keys(err.keyValue);
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
  }

  if (statusCode >= 500 && !(err instanceof ApiError)) {
    console.error(err);
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
