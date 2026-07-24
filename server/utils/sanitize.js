const HTML_ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_REGEX = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_URI_REGEX = /javascript\s*:/gi;
const DANGEROUS_ATTRS_REGEX = /\s*(href|src|action)\s*=\s*["']?\s*javascript\s*:/gi;

/**
 * Strip HTML tags and encode special characters to prevent XSS.
 * Safe for use on user-supplied text fields (notes, descriptions, messages, etc.)
 */
export function stripHtml(input) {
  if (typeof input !== 'string') return input;
  let clean = input;
  clean = clean.replace(SCRIPT_REGEX, '');
  clean = clean.replace(EVENT_HANDLER_REGEX, '');
  clean = clean.replace(JAVASCRIPT_URI_REGEX, '');
  clean = clean.replace(DANGEROUS_ATTRS_REGEX, '');
  clean = clean.replace(HTML_TAG_REGEX, '');
  clean = clean.replace(/[&<>"'`/]/g, (char) => HTML_ENTITY_MAP[char] || char);
  return clean;
}

/**
 * Sanitize an object by stripping HTML from all string values recursively.
 */
export function sanitizeObject(obj) {
  if (typeof obj === 'string') return stripHtml(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
}

/**
 * Express middleware that sanitizes req.body before reaching route handlers.
 */
export function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

/**
 * Zod transform: strips HTML from a string field during validation.
 * Use as: z.string().transform(sanitizeTransform)
 */
export function sanitizeTransform(value) {
  return typeof value === 'string' ? stripHtml(value) : value;
}

/**
 * @deprecated Use sanitizeTransform with .transform() instead.
 * This function is kept for backward compatibility but is a no-op refine.
 */
export function sanitizeCheck(value) {
  return typeof value === 'string' ? stripHtml(value) : value;
}
