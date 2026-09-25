/**
 * Dental clinical constants for the clinic dashboard. Mirrors the backend
 * `server/constants/dental.js` so each app stays self-contained (the same
 * pattern already used for role labels).
 */

export const DENTITION_TYPES = ['permanent', 'primary', 'mixed'];

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

export const TOOTH_STATE_LABELS = {
  sound: 'Sound',
  caries: 'Caries',
  filled: 'Restored',
  crown: 'Crown',
  root_canal: 'Root Canal',
  implant: 'Implant',
  missing: 'Missing',
  bridge: 'Bridge',
  extraction_scheduled: 'Extraction Scheduled',
  fractured: 'Fractured',
};

export const SURFACES = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal'];

export const SURFACE_LABELS = {
  mesial: 'Mesial',
  distal: 'Distal',
  buccal: 'Buccal',
  lingual: 'Lingual',
  occlusal: 'Occlusal',
};

export const SURFACE_CONDITIONS = ['sound', 'caries', 'restored'];

export const SURFACE_CONDITION_LABELS = {
  sound: 'Sound',
  caries: 'Caries',
  restored: 'Restored',
};

export const PROCEDURE_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

export const PROCEDURE_STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PROCEDURE_STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
  in_progress: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

export const PLAN_STATUSES = ['active', 'completed', 'archived'];

export const PLAN_STATUS_LABELS = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export const PLAN_STATUS_STYLES = {
  active: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  archived: 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300',
};

export const ATTACHMENT_TYPES = ['xray', 'photo', 'document'];

export const ATTACHMENT_TYPE_LABELS = {
  xray: 'X-Ray',
  photo: 'Photo',
  document: 'Document',
};

/**
 * Mirrors the server rule in `server/modules/emr/emr.validator.js`: a clinical
 * attachment reference must be either a same-origin API path (the authenticated
 * encrypted-download route the server hands back on upload) or an absolute
 * https link. Everything else — `javascript:`, `data:`, other schemes — is
 * rejected so a note can never carry a script-injection link.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isValidAttachmentUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  return value.startsWith('/api/') || /^https:\/\//i.test(value);
}

/** True when the reference points at a third-party host. */
export function isExternalAttachmentUrl(url) {
  return /^https:\/\//i.test(String(url || '').trim());
}

export const QUADRANTS = {
  ur: { label: 'Upper Right', symbol: '\u2518' },
  ul: { label: 'Upper Left', symbol: '\u2514' },
  ll: { label: 'Lower Left', symbol: '\u2510' },
  lr: { label: 'Lower Right', symbol: '\u250C' },
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
    palmer = 9 - n;
    fdi = 19 - n;
    arch = 'upper';
    side = 'right';
  } else if (n <= 16) {
    quadrant = 'ul';
    palmer = n - 8;
    fdi = n + 12;
    arch = 'upper';
    side = 'left';
  } else if (n <= 24) {
    quadrant = 'll';
    palmer = 25 - n;
    fdi = 55 - n;
    arch = 'lower';
    side = 'left';
  } else {
    quadrant = 'lr';
    palmer = n - 24;
    fdi = n + 16;
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

export const PERMANENT_TEETH = Array.from({ length: 32 }, (_, i) => describeTooth(i + 1));

/* ------------------------------------------------------------------ S1b: FDI canonical codes.
 *
 * The backend stores FDI (ISO 3950) as the canonical tooth code and accepts
 * legacy Universal (1-32) for backward compatibility. This module is the ONE
 * place that converts between the systems — components must not duplicate
 * this logic. Rules:
 * - Internal tooth identity and every new write use FDI (`toothFdi`,
 *   `toothChartPayload` sends `{ fdi }` with no conflicting `number`).
 * - The single-tooth route `PATCH .../teeth/:number` stays legacy-Universal
 *   (backend reads 1-32 as Universal; an FDI code like 11 would misroute),
 *   so `toothRouteCode` derives Universal centrally for that one path.
 * - Primary-dentition FDI codes (51-85) are explicitly unsupported: they
 *   resolve to null and are never coerced into a wrong permanent tooth.
 */

export function isValidFdi(code) {
  const n = Number(code);
  if (!Number.isInteger(n)) return false;
  const quadrant = Math.floor(n / 10);
  const position = n % 10;
  return quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8;
}

export function universalToFdi(universal) {
  const meta = describeTooth(universal);
  return meta ? meta.fdi : null;
}

const FDI_TO_UNIVERSAL = new Map(PERMANENT_TEETH.map((t) => [t.fdi, t.universal]));

export function fdiToUniversal(fdi) {
  const n = Number(fdi);
  if (!isValidFdi(n)) return null;
  return FDI_TO_UNIVERSAL.get(n) ?? null;
}

/**
 * Canonical FDI code for a tooth-like object from any API generation:
 * a valid `fdi` wins; otherwise it is derived from legacy `number`/`tooth`.
 * Returns null when neither side is usable (caller renders a fallback).
 */
export function toothFdi(tooth) {
  if (!tooth) return null;
  if (isValidFdi(tooth.fdi)) return Number(tooth.fdi);
  return universalToFdi(tooth.number ?? tooth.tooth);
}

/**
 * Legacy Universal code, for the `:number` route param and any other
 * legacy-compatible path. Mirrors the backend rule (FDI wins on conflict) so
 * the route always addresses the same tooth as the `{ fdi }` body.
 * Returns null when unresolvable (caller must not call the API).
 */
export function toothUniversal(tooth) {
  if (!tooth) return null;
  if (isValidFdi(tooth.fdi)) return fdiToUniversal(tooth.fdi);
  const legacy = tooth.number ?? tooth.tooth;
  return describeTooth(legacy) ? Number(legacy) : null;
}

/**
 * Canonical write payload for chart-tooth edits: explicit `fdi`, never a
 * conflicting Universal `number` (the backend resolves identity from `fdi`).
 */
export function toothChartPayload(tooth, patch) {
  return { fdi: toothFdi(tooth), ...(patch || {}) };
}

/**
 * Route code for `PATCH .../dental-chart/teeth/:number`, which the backend
 * treats as legacy Universal (FDI 11-32 overlap numerically with Universal
 * 1-32 and would misroute). Centralized here with that warning attached.
 */
export function toothRouteCode(tooth) {
  return toothUniversal(tooth);
}

/** Shared tooth dropdown options (canonical FDI values + labels). */
export const FDI_TOOTH_OPTIONS = [
  { value: '', label: '—' },
  ...PERMANENT_TEETH.map((t) => ({ value: String(t.fdi), label: String(t.fdi), name: t.name })),
];

/**
 * Display label for a plan-item/chip tooth reference: canonical FDI with the
 * legacy `#N` affordance, or an em dash when no usable code exists.
 */
export function formatToothLabel(tooth) {
  const fdi = toothFdi(tooth);
  return fdi ? `#${fdi}` : '—';
}

export const ARCH_GROUPS = {
  upperRight: PERMANENT_TEETH.filter((t) => t.arch === 'upper' && t.side === 'right'),
  upperLeft: PERMANENT_TEETH.filter((t) => t.arch === 'upper' && t.side === 'left'),
  lowerLeft: PERMANENT_TEETH.filter((t) => t.arch === 'lower' && t.side === 'left'),
  lowerRight: PERMANENT_TEETH.filter((t) => t.arch === 'lower' && t.side === 'right'),
};

/**
 * Tailwind classes used to render each tooth state on the interactive chart.
 */
export const TOOTH_STATE_STYLES = {
  sound: { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', hex: '#a7f3d0' },
  caries: { dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', hex: '#fda4af' },
  filled: { dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300', hex: '#7dd3fc' },
  crown: { dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', hex: '#c4b5fd' },
  root_canal: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', hex: '#fcd34d' },
  implant: { dot: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300', hex: '#5eead4' },
  missing: { dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400', hex: '#cbd5e1' },
  bridge: { dot: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300', hex: '#a5b4fc' },
  extraction_scheduled: { dot: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300', hex: '#fdba74' },
  fractured: { dot: 'bg-pink-500', text: 'text-pink-700 dark:text-pink-300', hex: '#f9a8d4' },
};

export function toothStyle(state) {
  return TOOTH_STATE_STYLES[state] || TOOTH_STATE_STYLES.sound;
}

export function findTooth(teeth, number) {
  return (teeth || []).find((t) => t.number === Number(number));
}
