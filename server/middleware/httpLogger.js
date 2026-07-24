import pinoHttp from 'pino-http';
import logger from '../utils/logger.js';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id || crypto.randomUUID?.() || `req-${Date.now()}`,
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.originalUrl} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.originalUrl} ${res.statusCode} - ${err.message}`;
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[REDACTED]',
  },
  autoLogging: process.env.NODE_ENV === 'production'
    ? { ignore: (req) => req.url === '/api/health' || req.url === '/health' }
    : false,
});
