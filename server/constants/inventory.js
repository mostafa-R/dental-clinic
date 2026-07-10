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
 * Mapping of dental procedure states (from the dental chart) to the inventory
 * category they typically consume. Used by the auto-deduction hook when a
 * treatment item is marked completed.
 */
export const PROCEDURE_DEDUCTION_MAP = Object.freeze({
  root_canal: 'filling_material',
  filled: 'filling_material',
  crown: 'consumable',
  extraction_scheduled: 'anesthetic',
});
