/**
 * Dental clinical constants shared by EMR models and the interactive chart.
 *
 * Tooth numbering is stored canonically using the Universal Numbering System
 * (permanent teeth 1-32). Palmer and FDI notations are derived on read for
 * display, so the data layer stays in a single, sortable, comparable key space.
 */

export const DENTITION_TYPES = ['permanent', 'primary', 'mixed'];

/**
 * Overall tooth state. Independent from per-surface conditions, which describe
 * where on the tooth a finding (caries/restoration) is located.
 */
export const TOOTH_STATES = [
  'sound',
  'caries',
  'filled',
  'crown',
  'root_canal',
  'implant',
  'missing',
  'bridge',
  'extraction_scheduled',
  'fractured',
];

/**
 * The five chartable surfaces. `buccal` is the cheek-facing surface (facial),
 * `lingual` the tongue/palate-facing surface, and `occlusal` the chewing surface
 * (referred to as `incisal` on anterior teeth by convention).
 */
export const SURFACES = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'];

/**
 * Condition assigned to a specific surface of a tooth.
 */
export const SURFACE_CONDITIONS = ['sound', 'caries', 'restored'];

/**
 * Treatment plan line-item lifecycle. Items move forward through these states
 * as the doctor performs them across visits.
 */
export const PROCEDURE_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

export const PLAN_STATUSES = ['active', 'completed', 'archived'];

export const ATTACHMENT_TYPES = ['xray', 'photo', 'document'];

/**
 * Canonical Palmer quadrant keys. Symbols open toward the dental midline.
 */
const QUADRANTS = {
  ur: { label: 'Upper Right', symbol: '\u2518' }, // ┘
  ul: { label: 'Upper Left', symbol: '\u2514' }, // └
  ll: { label: 'Lower Left', symbol: '\u2510' }, // ┐
  lr: { label: 'Lower Right', symbol: '\u250C' }, // ┌
};

const PALMER_NAMES = [
  '',
  'Central Incisor',
  'Lateral Incisor',
  'Canine',
  'First Premolar',
  'Second Premolar',
  'First Molar',
  'Second Molar',
  'Third Molar',
];

/**
 * Map a Universal Numbering tooth (1-32) to its notation metadata.
 * Returns null for out-of-range values so callers can guard inputs.
 */
function describeTooth(universal) {
  const n = Number(universal);
  if (!Number.isInteger(n) || n < 1 || n > 32) return null;

  let quadrant;
  let palmer;
  let fdi;
  let arch;
  let side;

  if (n <= 8) {
    quadrant = 'ur';
    palmer = 9 - n; // 1 -> 8, 8 -> 1
    fdi = 19 - n; // 1 -> 18, 8 -> 11
    arch = 'upper';
    side = 'right';
  } else if (n <= 16) {
    quadrant = 'ul';
    palmer = n - 8; // 9 -> 1, 16 -> 8
    fdi = n + 12; // 9 -> 21, 16 -> 28
    arch = 'upper';
    side = 'left';
  } else if (n <= 24) {
    quadrant = 'll';
    palmer = 25 - n; // 17 -> 8, 24 -> 1
    fdi = 55 - n; // 17 -> 38, 24 -> 31
    arch = 'lower';
    side = 'left';
  } else {
    quadrant = 'lr';
    palmer = n - 24; // 25 -> 1, 32 -> 8
    fdi = n + 16; // 25 -> 41, 32 -> 48
    arch = 'lower';
    side = 'right';
  }

  const meta = QUADRANTS[quadrant];
  return {
    universal: n,
    quadrant,
    palmer,
    palmerSymbol: meta.symbol,
    palmerNotation: `${palmer}${meta.symbol}`,
    fdi,
    arch,
    side,
    name: PALMER_NAMES[palmer] || '',
  };
}

/** Ordered list of all 32 permanent teeth with full notation metadata. */
const PERMANENT_TEETH = Array.from({ length: 32 }, (_, i) => describeTooth(i + 1));

/**
 * Build the default set of 32 sound teeth for a freshly created chart.
 */
export function defaultTeeth() {
  return PERMANENT_TEETH.map((t) => ({
    number: t.universal,
    state: 'sound',
    surfaces: {
      mesial: 'sound',
      distal: 'sound',
      buccal: 'sound',
      lingual: 'sound',
      occlusal: 'sound',
    },
    notes: '',
  }));
}
