/**
 * Clinic-timezone date handling for the browser.
 *
 * The server resolves every "local day" through the tenant's stored IANA zone
 * (`server/utils/zonedDates.js`). The client had no way to learn that zone, so
 * it used its own — and the two disagree for any clinic not on the
 * receptionist's machine. The concrete failures:
 *
 *   - `<input type="date">` / `datetime-local` defaults and round-trips used
 *     `Date#getTimezoneOffset`, so a form pre-filled with "now" and submitted
 *     an instant offset by the browser's UTC offset — a 09:00 appointment
 *     silently became 06:00 (or 12:00) for the clinic.
 *   - The live queue asked for "today" in the browser's zone, so after clinic
 *     midnight the board showed yesterday's queue.
 *   - A Day Close date (stored as clinic-local midnight) formatted in a
 *     browser further west rendered as the *previous* day.
 *
 * This module is the client's mirror of the server's `zonedDates`: identical
 * semantics, implemented over `Intl` with no system-timezone shortcuts, so a
 * date means the same thing on both sides of the wire.
 *
 * The zone arrives from `GET /auth/my-permissions` (see `setClinicTimeZone`).
 * Until it does, the browser's own zone is used — that is no worse than the
 * previous behaviour, and it self-corrects on the first permissions fetch.
 */

/**
 * Validate a zone name the way the server's `normalizeTimeZone` does, so a bad
 * value degrades to the browser zone instead of throwing a `RangeError` out of
 * an `Intl` constructor mid-render.
 */
function safeZone(tz) {
  if (typeof tz !== 'string' || tz.trim() === '') return browserZone();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format();
    return tz;
  } catch {
    return browserZone();
  }
}

function browserZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

let currentZone = null;

/** The clinic's IANA zone, or the browser's until the server tells us. */
export function clinicTimeZone() {
  return safeZone(currentZone);
}

/**
 * Record the clinic's zone. Called from the app shell as soon as
 * `myPermissions` resolves, and again on every revalidation (so a clinic that
 * changes its zone does not need a re-login).
 */
export function setClinicTimeZone(tz) {
  currentZone = safeZone(tz);
  return currentZone;
}

/** Drop the cached zone (logout / tenant switch) so the next user starts clean. */
export function clearClinicTimeZone() {
  currentZone = null;
}

/** `YYYY-MM-DD` for an instant, read in `tz`. */
export function localDateString(instantMs, tz = clinicTimeZone()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** `YYYY-MM-DDTHH:mm` for an instant, read in `tz` — the `datetime-local` shape. */
export function localDateTimeString(instantMs, tz = clinicTimeZone()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * The UTC offset (ms) in effect at `instantMs` inside `tz`, by formatting the
 * instant into the zone and diffing the wall clock against the UTC instant.
 */
export function zonedOffsetMs(instantMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(tz),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instantMs;
}

/** Parse a `YYYY-MM-DD` string, rejecting impossible dates like `2026-02-30`. */
export function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, mo, d };
}

export function isDateOnlyString(value) {
  return parseDateOnly(value) !== null;
}

/** UTC instant of local midnight for a `YYYY-MM-DD` date in `tz`. */
export function zonedDayStartUtc(value, tz = clinicTimeZone()) {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const zone = safeZone(tz);
  const { y, mo, d } = parsed;
  // Probe at local noon so a DST change at midnight cannot be straddled.
  const offset = zonedOffsetMs(Date.UTC(y, mo - 1, d, 12), zone);
  let t = Date.UTC(y, mo - 1, d) - offset;
  const offsetAtT = zonedOffsetMs(t, zone);
  if (offsetAtT !== offset) {
    t = Date.UTC(y, mo - 1, d) - offsetAtT;
  }
  return t;
}

/** UTC instant of local midnight for the day after the day containing `target`. */
export function zonedNextDayStartUtc(target, tz = clinicTimeZone()) {
  const zone = safeZone(tz);
  const start = typeof target === 'number' ? target : zonedDayStartUtc(target, zone);
  if (start == null || Number.isNaN(start)) return null;
  const [y, mo, d] = localDateString(start, zone).split('-').map(Number);
  return zonedDayStartUtc(new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10), zone);
}

/** Inclusive local-day `{ start, end }` (end is exclusive) for a date in `tz`. */
export function zonedDayRangeUtc(value, tz = clinicTimeZone()) {
  const start = zonedDayStartUtc(value, tz);
  if (start == null) return null;
  const end = zonedNextDayStartUtc(start, tz);
  if (end == null) return null;
  return { start: new Date(start), end: new Date(end) };
}

/** "Today" in the clinic's zone, with the day window. */
export function zonedToday(nowMs = Date.now(), tz = clinicTimeZone()) {
  const dateStr = localDateString(nowMs, tz);
  const range = zonedDayRangeUtc(dateStr, tz);
  return range ? { dateStr, ...range } : null;
}

/**
 * Value for `<input type="date">`: the clinic-local day of `value`. Use for
 * both the initial value and `max`, or a user west of the clinic can never
 * select today.
 *
 * An already date-only string is returned unchanged — it carries no instant, so
 * there is nothing to convert and re-reading it through a zone would shift it.
 */
export function toDateInputValue(value, tz = clinicTimeZone()) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && isDateOnlyString(value)) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return localDateString(d.getTime(), safeZone(tz));
}

/** Minutes since local midnight in `tz` — the calendar-grid position of an instant. */
export function zonedMinutesOfDay(instantMs, tz = clinicTimeZone()) {
  const s = localDateTimeString(instantMs, safeZone(tz)); // YYYY-MM-DDTHH:mm
  return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
}

/** Value for `<input type="datetime-local">`: clinic-local wall clock. */
export function toDateTimeInputValue(value, tz = clinicTimeZone()) {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return localDateTimeString(d.getTime(), safeZone(tz));
}

/**
 * Read a `<input type="datetime-local">` value back into a UTC instant,
 * interpreting the wall clock as clinic-local.
 *
 * `new Date('2026-09-26T09:00')` is parsed as *browser*-local by the ES spec,
 * which is how a 09:00 clinic appointment became 06:00 on submit. This is the
 * fix: resolve the wall clock in the clinic's zone, not the browser's.
 *
 * A value with an explicit offset/Z (a full ISO timestamp) is returned as-is.
 *
 * A wall clock inside the spring-forward gap (e.g. 02:30 on a day the clocks
 * jump 02:00 -> 03:00) has no corresponding instant. It is normalised to the
 * pre-gap instant, which is the standard resolution and keeps the form
 * deterministic. The server never performs this conversion — it stores the
 * absolute instant the client sends — so the two sides cannot disagree.
 */
export function fromDateTimeInputValue(value, tz = clinicTimeZone()) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim());
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, ys, mos, ds, hs, mis, ss] = m;
  if (!parseDateOnly(`${ys}-${mos}-${ds}`)) return null;
  const zone = safeZone(tz);
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const wallMs = Date.UTC(y, mo - 1, d, Number(hs), Number(mis), Number(ss || 0));
  // The instant for a wall clock is `wall clock - offset in effect at that
  // wall clock`. Seed with the day's midday offset, then refine against the
  // offset actually in effect at the candidate instant so a DST change inside
  // the day (or an ambiguous/skipped hour) still lands on the intended time.
  const dayOffset = zonedOffsetMs(Date.UTC(y, mo - 1, d, 12), zone);
  let t = wallMs - dayOffset;
  const o1 = zonedOffsetMs(t, zone);
  if (o1 !== dayOffset) t = wallMs - o1;
  const o2 = zonedOffsetMs(t, zone);
  if (o2 !== o1) t = wallMs - o2;
  return new Date(t);
}

/** Current instant as a `datetime-local` value in the clinic's zone. */
export function nowAsDateTimeInputValue(tz = clinicTimeZone(), nowMs = Date.now()) {
  return toDateTimeInputValue(new Date(nowMs), tz);
}

/** Today's date-only value in the clinic's zone. */
export function todayAsDateInputValue(tz = clinicTimeZone(), nowMs = Date.now()) {
  return localDateString(nowMs, safeZone(tz));
}

/**
 * Combine a `YYYY-MM-DD` and an `HH:mm` picked in the clinic's UI into a UTC
 * instant. Used by forms that keep date and time in separate controls.
 */
export function combineDateAndTime(dateStr, timeStr, tz = clinicTimeZone()) {
  if (!dateStr) return null;
  const time = timeStr || '00:00';
  return fromDateTimeInputValue(`${dateStr}T${String(time).slice(0, 5)}`, tz);
}
