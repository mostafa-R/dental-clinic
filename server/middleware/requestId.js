import crypto from 'node:crypto';

/**
 * Injects a unique X-Request-ID into every request/response cycle.
 * If the client sends one, it is propagated; otherwise a new UUID is generated.
 */
export function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
