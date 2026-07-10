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

export const EXPENSE_PAYMENT_METHODS = ['cash', 'bank', 'card'];

export const COMMISSION_STATUS = ['pending', 'paid'];

/**
 * Round to 2 decimals to avoid floating-point drift on money fields.
 */
export function round2(value) {
  const n = Number(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
