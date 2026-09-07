/**
 * Canonical physical-chair key.
 *
 * The same chair can be typed differently across the UI ("Chair 01",
 * "chair-01", "Chair_01", …). All DB-level double-booking enforcement and
 * overlap matching is keyed on this canonical form (uppercase, non-alphanumeric
 * characters stripped) so those labels collapse to one identity. The
 * display-friendly raw `chair` value is kept untouched.
 */
export function canonicalChairKey(chair) {
  const raw = String(chair ?? '').trim();
  if (!raw) return '';
  return raw.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export default canonicalChairKey;