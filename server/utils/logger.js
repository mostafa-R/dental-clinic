import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const VALID_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];
const LOG_LEVEL = VALID_LEVELS.includes(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : (isProd ? 'info' : 'debug');

const logger = pino({
  level: LOG_LEVEL,
  transport: isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
  formatters: {
    level(label, number) {
      return { level: number, levelLabel: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'secret'],
    censor: '[REDACTED]',
  },
});

export function logError(err, context = {}) {
  logger.error({
    err: {
      type: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
    },
    ...context,
  }, err.message);
}

export function logInfo(message, data = {}) {
  logger.info(data, message);
}

export function logWarn(message, data = {}) {
  logger.warn(data, message);
}

export { logger };
export default logger;
