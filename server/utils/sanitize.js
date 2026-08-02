const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_REGEX = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_URI_REGEX = /javascript\s*:/gi;
const DANGEROUS_ATTRS_REGEX = /\s*(href|src|action)\s*=\s*["']?\s*javascript\s*:/gi;

/**
 * Strip dangerous HTML constructs from user-supplied rich-text fields.
 * Opt-in only (apply via sanitizeTransform on fields that render as HTML).
 * Deliberately does NOT entity-encode text: escaping belongs in the view layer,
 * and encoding on write corrupts stored data (passwords, notes, messages, secrets).
 */
export function stripHtml(input) {
  if (typeof input !== 'string') return input;
  let clean = input;
  clean = clean.replace(SCRIPT_REGEX, '');
  clean = clean.replace(EVENT_HANDLER_REGEX, '');
  clean = clean.replace(JAVASCRIPT_URI_REGEX, '');
  clean = clean.replace(DANGEROUS_ATTRS_REGEX, '');
  clean = clean.replace(HTML_TAG_REGEX, '');
  return clean;
}

/**
 * Zod transform: strips dangerous HTML from a string field during validation.
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
