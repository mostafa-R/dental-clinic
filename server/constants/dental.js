/**
 * Dental clinical constants shared by EMR models and the interactive chart.
 *
 * Tooth numbering is stored canonically using FDI World Dental Federation
 * notation (ISO 3950: two-digit codes 11-18, 21-28, 31-38, 41-48 for the
 * permanent dentition). The legacy Universal Numbering System (1-32) is
 * retained alongside as `number` for one release cycle: writes accept either
 * code and the missing side is derived, so old clients keep working while new
 * integrations standardize on `fdi`. Palmer notation remains display-only,
 * derived on read via describeTooth().
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
 * Exported: the single source of truth for cross-notation conversion
 * (models, validators, controllers, and migration 005 all share it).
 */
export function describeTooth(universal) {
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
 * FDI (ISO 3950) helpers — permanent dentition only (quadrants 1-4).
 * Primary-dentition codes (51-85) are intentionally unsupported until the
 * chart gains a primary-dentition mode; they are rejected, never coerced.
 */
export function isValidFdi(code) {
  const n = Number(code);
  if (!Number.isInteger(n)) return false;
  const quadrant = Math.floor(n / 10);
  const position = n % 10;
  return quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8;
}

/** Universal (1-32) -> FDI (11-48). Returns null for out-of-range input. */
export function universalToFdi(universal) {
  const meta = describeTooth(universal);
  return meta ? meta.fdi : null;
}

const FDI_TO_UNIVERSAL = new Map(PERMANENT_TEETH.map((t) => [t.fdi, t.universal]));

/** FDI (11-48) -> Universal (1-32). Returns null for invalid codes. */
export function fdiToUniversal(fdi) {
  const n = Number(fdi);
  if (!isValidFdi(n)) return null;
  return FDI_TO_UNIVERSAL.get(n) ?? null;
}

/**
 * Normalize a tooth reference carrying either notation (or both) into
 * `{ universal, fdi }`. Accepted shapes: `{ fdi }`, `{ number }`,
 * `{ tooth }`, `{ universal }` — bare numbers are read as Universal for
 * backward compatibility. When both sides are present but disagree, FDI
 * wins (it is the canonical code) and Universal is re-derived.
 * Returns null when neither side is a valid code.
 */
export function normalizeToothRef(ref) {
  if (ref === null || ref === undefined) return null;
  const obj = typeof ref === 'object' ? ref : { number: ref };
  const fdi = obj.fdi !== undefined && obj.fdi !== null && obj.fdi !== ''
    ? Number(obj.fdi)
    : null;
  if (fdi !== null && isValidFdi(fdi)) {
    return { universal: fdiToUniversal(fdi), fdi };
  }
  const legacy = obj.number ?? obj.tooth ?? obj.universal;
  const n = legacy !== undefined && legacy !== null && legacy !== '' ? Number(legacy) : null;
  const meta = n !== null ? describeTooth(n) : null;
  if (!meta) return null;
  return { universal: meta.universal, fdi: meta.fdi };
}

/**
 * Build the default set of 32 sound teeth for a freshly created chart.
 */
export function defaultTeeth() {
  return PERMANENT_TEETH.map((t) => ({
    number: t.universal,
    fdi: t.fdi,
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
