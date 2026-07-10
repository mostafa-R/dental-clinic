export const INVENTORY_CATEGORIES = [
  'anesthetic',
  'filling_material',
  'consumable',
  'instrument',
  'medication',
  'hygiene',
  'other',
];

export const INVENTORY_CATEGORY_LABELS = {
  anesthetic: 'Anesthetics',
  filling_material: 'Filling Materials',
  consumable: 'Consumables',
  instrument: 'Instruments',
  medication: 'Medications',
  hygiene: 'Hygiene',
  other: 'Other',
};

export const INVENTORY_UNITS = ['unit', 'box', 'pack', 'bottle', 'tube', 'set', 'ml', 'g'];

export const UNIT_LABELS = {
  unit: 'units',
  box: 'boxes',
  pack: 'packs',
  bottle: 'bottles',
  tube: 'tubes',
  set: 'sets',
  ml: 'ml',
  g: 'g',
};

export const STOCK_TX_TYPES = ['stock_in', 'stock_out', 'adjustment', 'expired'];

export const STOCK_TX_LABELS = {
  stock_in: 'Stock In',
  stock_out: 'Stock Out',
  adjustment: 'Adjustment',
  expired: 'Expired',
};

export function unitLabel(unit, qty) {
  const label = UNIT_LABELS[unit] || unit;
  return qty === 1 ? unit : label;
}
