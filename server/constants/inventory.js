/**
 * Inventory constants for the stock management module.
 */

export const INVENTORY_CATEGORIES = [
  'anesthetic',
  'filling_material',
  'consumable',
  'instrument',
  'medication',
  'hygiene',
  'other',
];

export const INVENTORY_UNITS = ['unit', 'box', 'pack', 'bottle', 'tube', 'set', 'ml', 'g'];

export const STOCK_TX_TYPES = ['stock_in', 'stock_out', 'adjustment', 'expired', 'initial'];

/**
 * Mapping of dental procedure NAMES (procedureName on a treatment plan item)
 * to the inventory category and quantity they consume. This is the source of
 * truth for auto-deduction when a procedure is invoiced/executed — it is
 * independent of the dental-chart tooth state, which is unreliable as a stock
 * driver (issue #3).
 *
 * Each entry: { category, quantity, fallbackCategory? }
 * - `category` is the primary inventory category deducted.
 * - `quantity` is the units deducted per procedure.
 * - `fallbackCategory` (optional) is deducted only if no stock remains in the
 *   primary category, so a procedure can still decrement without hard-failing.
 *
 * Matching is case-insensitive on the procedure name; unknown procedures are
 * treated as `other`.
 */
export const PROCEDURE_DEDUCTION_MAP = Object.freeze({
  filling: { category: 'filling_material', quantity: 1, fallbackCategory: 'consumable' },
  restoration: { category: 'filling_material', quantity: 1, fallbackCategory: 'consumable' },
  composite: { category: 'filling_material', quantity: 1, fallbackCategory: 'consumable' },
  amalgam: { category: 'filling_material', quantity: 1, fallbackCategory: 'consumable' },
  root_canal: { category: 'medication', quantity: 1, fallbackCategory: 'consumable' },
  endodontic: { category: 'medication', quantity: 1, fallbackCategory: 'consumable' },
  extraction: { category: 'anesthetic', quantity: 1, fallbackCategory: 'consumable' },
  crown: { category: 'consumable', quantity: 1, fallbackCategory: 'other' },
  bridge: { category: 'consumable', quantity: 1, fallbackCategory: 'other' },
  denture: { category: 'consumable', quantity: 1, fallbackCategory: 'other' },
  cleaning: { category: 'hygiene', quantity: 1, fallbackCategory: 'consumable' },
  scaling: { category: 'hygiene', quantity: 1, fallbackCategory: 'consumable' },
  polish: { category: 'hygiene', quantity: 1, fallbackCategory: 'consumable' },
  other: { category: 'consumable', quantity: 1, fallbackCategory: 'other' },
});

/**
 * LEGACY fallback: map dental-chart tooth states to a category. Retained only
 * so existing callers that still pass a toothState can resolve a sensible
 * category when no procedure-name match exists. New code should prefer
 * `resolveProcedureDeduction`.
 */
export const TOOTH_STATE_DEDUCTION_MAP = Object.freeze({
  root_canal: 'medication',
  filled: 'filling_material',
  crown: 'consumable',
  extraction_scheduled: 'anesthetic',
});

/**
 * Resolve what a procedure should deduct, preferring the procedure NAME. When
 * the name does not appear in PROCEDURE_DEDUCTION_MAP, fall back to a
 * tooth-state lookup, then to the default `other` entry.
 *
 * Matching:
 *  - The full name (spaces normalized to underscores and lowercased) is tried
 *    first, so "Root Canal Therapy" matches `root_canal`.
 *  - If that fails, the leading word is tried (e.g. "Extraction of tooth" →
 *    "extraction").
 *
 * Returns an array of candidate { category, quantity } to apply in order:
 *   [primary, ...fallbacks]
 */
export function resolveProcedureDeduction(procedureName, toothState) {
  const normalized = String(procedureName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  // 1. Exact full-name match (multi-word, e.g. "root_canal").
  const byFullName = PROCEDURE_DEDUCTION_MAP[normalized];

  // 2. Key containment: a phrase like "root_canal_therapy" should match the
  //    "root_canal" key. Iterate by key length (longest first) so the most
  //    specific multi-word key wins.
  const byContained = !byFullName
    ? Object.keys(PROCEDURE_DEDUCTION_MAP)
        .sort((a, b) => b.length - a.length)
        .map((k) => ({ k, v: PROCEDURE_DEDUCTION_MAP[k] }))
        .find(({ k }) => normalized.includes(k))
    : null;

  const primary = byFullName || (byContained && byContained.v);
  if (primary) {
    return [
      { category: primary.category, quantity: primary.quantity },
      ...(primary.fallbackCategory && primary.fallbackCategory !== primary.category
        ? [{ category: primary.fallbackCategory, quantity: primary.quantity }]
        : []),
    ];
  }

  // 3. Leading-word match (e.g. "extraction_left_molar" → "extraction").
  const leadingWord = normalized.split('_')[0];
  const byFirstWord = PROCEDURE_DEDUCTION_MAP[leadingWord];
  if (byFirstWord) {
    return [
      { category: byFirstWord.category, quantity: byFirstWord.quantity },
      ...(byFirstWord.fallbackCategory && byFirstWord.fallbackCategory !== byFirstWord.category
        ? [{ category: byFirstWord.fallbackCategory, quantity: byFirstWord.quantity }]
        : []),
    ];
  }

  // 4. Tooth-state fallback (legacy).
  const byTooth = TOOTH_STATE_DEDUCTION_MAP[toothState];
  if (byTooth) {
    return [{ category: byTooth, quantity: 1 }];
  }

  // 5. Default.
  return [{ category: PROCEDURE_DEDUCTION_MAP.other.category, quantity: PROCEDURE_DEDUCTION_MAP.other.quantity }];
}
