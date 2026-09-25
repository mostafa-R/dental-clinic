/**
 * Accounting constants shared across the finance module.
 */

export const EXPENSE_CATEGORIES = [
  'salary',
  'rent',
  'utilities',
  'supplies',
  'maintenance',
  'marketing',
  'other',
];

export const EXPENSE_PAYMENT_METHODS = ['cash', 'bank', 'card', 'wallet'];

export const COMMISSION_STATUS = ['pending', 'paid', 'void'];

/**
 * Money representation utilities to avoid floating-point precision issues.
 * Using integer minor units (cents) instead of decimal numbers.
 */

/**
 * Convert decimal amount to integer cents
 */
export function toCents(decimal) {
  const n = Number(decimal) || 0;
  // Use Math.round with Number.EPSILON to handle edge cases like 1.005
  return Math.round((n + Number.EPSILON) * 100);
}

/**
 * Convert integer cents back to decimal
 */
export function fromCents(cents) {
  const c = Number(cents) || 0;
  return c / 100;
}

/**
 * Round to 2 decimals using cents-based calculation
 */
export function round2(value) {
  const cents = toCents(value);
  return fromCents(cents);
}

/**
 * Add two monetary amounts using cents precision
 */
export function addMoney(a, b) {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * Subtract two monetary amounts using cents precision
 */
export function subtractMoney(a, b) {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Multiply monetary amount by a scalar using cents precision
 */
export function multiplyMoney(amount, multiplier) {
  return fromCents(toCents(amount) * multiplier);
}

/**
 * Compare two monetary amounts using cents precision
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareMoney(a, b) {
  const centsA = toCents(a);
  const centsB = toCents(b);
  return centsA < centsB ? -1 : centsA > centsB ? 1 : 0;
}
