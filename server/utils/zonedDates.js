import { normalizeTimeZone } from './timezoneUtils.js';

/**
 * Timezone-aware "local day" helpers.
 *
 * These are the single source of truth for what "the start/end of a local
 * date" means anywhere in the app. Date-only inputs (e.g. `?from=YYYY-MM-DD`)
 * must NEVER be folded into local boundaries using the server's OS timezone —
 * that silently shifts the window by the server's UTC offset for every clinic
 * east/west of the server (the week-view drop bug). Every conversion here goes
 * through the clinic's stored IANA timezone via `Intl` explicitly, so results
 * are identical irrespective of the machine the server runs on.
 */

export function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, mo, d };
}

export function localDateString(instantMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * The UTC offset (ms) in effect at `instantMs` inside `tz`.
 * Determined by formatting the instant into `tz` and diffing the resulting
 * wall-clock against the UTC instant — no system-timezone involvement.
 */
export function zonedOffsetMs(instantMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
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

/**
 * UTC instant (epoch ms) of local midnight for a `YYYY-MM-DD` date in `tz`.
 * The offset is probed at local noon (safely inside the day, away from any
 * midnight DST edge) and refined once, which is correct for every real
 * timezone transition.
 */
export function zonedDayStartUtc(value, tz) {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const { y, mo, d } = parsed;
  const noonProbe = Date.UTC(y, mo - 1, d, 12);
  const offset = zonedOffsetMs(noonProbe, tz);
  let t = Date.UTC(y, mo - 1, d) - offset;
  const offsetAtT = zonedOffsetMs(t, tz);
  if (offsetAtT !== offset) {
    t = Date.UTC(y, mo - 1, d) - offsetAtT;
  }
  return t;
}

/**
 * UTC instant of local midnight for the day AFTER the local day containing
 * `instantMs` (or the date-only target). Used to build exclusive `$lt` upper
 * bounds so a whole local day is included.
 */
export function zonedNextDayStartUtc(target, tz) {
  const start = typeof target === 'number' ? target : zonedDayStartUtc(target, tz);
  if (start == null || Number.isNaN(start)) return null;
  const [y, mo, d] = localDateString(start, tz)
    .split('-')
    .map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return zonedDayStartUtc(next.toISOString().slice(0, 10), tz);
}

/**
 * Inclusive local-day range `{ start, end }` (end is exclusively `$lt`-able)
 * for a date-only value in `tz`. Returns null when the value is not a valid
 * date-only string.
 */
export function zonedDayRangeUtc(value, tz) {
  const start = zonedDayStartUtc(value, tz);
  if (start == null) return null;
  const end = zonedNextDayStartUtc(start, tz);
  if (end == null) return null;
  return { start: new Date(start), end: new Date(end) };
}

/**
 * Local-day range enclosing `nowMs` in `tz`, plus the local `YYYY-MM-DD`
 * string for that day (`dateStr`). Shared by the live queue board and
 * call-next, which both mean "today" in the clinic's timezone — not the
 * server's.
 */
export function zonedTodayRangeUtc(nowMs, tz) {
  const dateStr = localDateString(nowMs, tz);
  const range = zonedDayRangeUtc(dateStr, tz);
  return range ? { dateStr, ...range } : null;
}

/**
 * Whether `value` looks like a date-only (`YYYY-MM-DD`) string — callers use
 * this to decide between "resolve a local day window" and "treat as an exact
 * instant" when parsing query params that may be either.
 */
export function isDateOnlyString(value) {
  return typeof value === 'string' && parseDateOnly(value) !== null;
}

/**
 * Build the mongoose `start` filter for a list query given its raw date params.
 *
 * Shared by every calendar view (day/week/future month): `date` selects one
 * local day, `from`/`to` select a local-day range. Date-only (`YYYY-MM-DD`)
 * values are resolved to the clinic's local day window in `tz`; values with an
 * explicit time are kept as exact instants. Returns `{ start }` filter keys
 * (empty object when nothing applies) so callers can spread it into the rest
 * of their query.
 */
export function buildDateRangeFilter({ date, from, to }, tz) {
  if (date) {
    if (isDateOnlyString(date)) {
      const range = zonedDayRangeUtc(date, tz);
      return range ? { start: { $gte: range.start, $lt: range.end } } : {};
    }
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      const range = zonedDayRangeUtc(localDateString(d.getTime(), tz), tz);
      return range ? { start: { $gte: range.start, $lt: range.end } } : {};
    }
    return {};
  }

  const range = {};
  if (from) {
    if (isDateOnlyString(from)) {
      const start = zonedDayStartUtc(from, tz);
      if (start != null) range.$gte = new Date(start);
    } else {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) range.$gte = d;
    }
  }
  if (to) {
    if (isDateOnlyString(to)) {
      const start = zonedDayStartUtc(to, tz);
      const end = start != null ? zonedNextDayStartUtc(start, tz) : null;
      if (end != null) range.$lt = new Date(end);
    } else {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) range.$lte = d;
    }
  }
  return Object.keys(range).length ? { start: range } : {};
}

export { normalizeTimeZone };