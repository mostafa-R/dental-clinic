// @vitest-environment node
/**
 * Tests for `lib/clinicTime.js` — the client mirror of the server's
 * `server/utils/zonedDates.js`.
 *
 * The bug class these cover was: the browser's zone was used wherever the
 * clinic's was needed, so a receptionist outside the clinic's zone booked the
 * wrong instant, saw the wrong "today", and read a clinic-local midnight as the
 * previous day. Every helper here is therefore pinned to an explicit zone, and
 * the tests always pass one, so they are independent of the machine running
 * them (`TZ` is never consulted).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setClinicTimeZone,
  clearClinicTimeZone,
  clinicTimeZone,
  localDateString,
  localDateTimeString,
  zonedDayStartUtc,
  zonedDayRangeUtc,
  zonedToday,
  isDateOnlyString,
  parseDateOnly,
  toDateInputValue,
  toDateTimeInputValue,
  fromDateTimeInputValue,
  zonedMinutesOfDay,
  combineDateAndTime,
} from './clinicTime';

const CAIRO = 'Africa/Cairo';
const NEW_YORK = 'America/New_York';
const UTC = 'UTC';

/** Egypt is UTC+2 in winter and UTC+3 in summer; pick dates on each side. */
const WINTER = '2026-01-15';
const SUMMER = '2026-07-15';

describe('parseDateOnly', () => {
  it('accepts a well-formed date', () => {
    expect(parseDateOnly('2026-09-26')).toEqual({ y: 2026, mo: 9, d: 26 });
  });

  it('rejects impossible dates instead of rolling them over', () => {
    // `new Date('2026-02-30')` silently becomes Mar 2, which would let a bad
    // day through and close the wrong day.
    expect(parseDateOnly('2026-02-30')).toBeNull();
    expect(parseDateOnly('2026-13-01')).toBeNull();
    expect(parseDateOnly('2026-00-10')).toBeNull();
  });

  it('rejects non-date shapes', () => {
    expect(parseDateOnly('26-09-2026')).toBeNull();
    expect(parseDateOnly('2026-9-26')).toBeNull();
    expect(parseDateOnly('2026-09-26T10:00')).toBeNull();
    expect(parseDateOnly('')).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
  });

  it('round-trips through isDateOnlyString', () => {
    expect(isDateOnlyString('2026-09-26')).toBe(true);
    expect(isDateOnlyString('2026-02-30')).toBe(false);
  });
});

describe('localDateString', () => {
  it('reads the calendar day in the given zone, not UTC', () => {
    // 22:00Z is already the 26th in Cairo (UTC+3) but still the 25th in UTC.
    const instant = Date.UTC(2026, 8, 25, 22, 0);
    expect(localDateString(instant, CAIRO)).toBe('2026-09-26');
    expect(localDateString(instant, UTC)).toBe('2026-09-25');
    expect(localDateString(instant, NEW_YORK)).toBe('2026-09-25');
  });

  it('is the mirror of zonedDayStartUtc: start formats back to the same day', () => {
    for (const tz of [CAIRO, NEW_YORK, UTC, 'Asia/Kolkata', 'Australia/Sydney']) {
      for (const day of ['2026-01-01', '2026-06-30', '2026-12-31']) {
        expect(localDateString(zonedDayStartUtc(day, tz), tz)).toBe(day);
      }
    }
  });
});

describe('zonedDayStartUtc', () => {
  it('returns local midnight as a UTC instant', () => {
    // Cairo is UTC+3 in July.
    expect(new Date(zonedDayStartUtc(SUMMER, CAIRO)).toISOString())
      .toBe('2026-07-14T21:00:00.000Z');
    // New York is UTC-4 in January.
    expect(new Date(zonedDayStartUtc(WINTER, NEW_YORK)).toISOString())
      .toBe('2026-01-15T05:00:00.000Z');
  });

  it('returns null for an invalid date rather than a wrong instant', () => {
    expect(zonedDayStartUtc('2026-02-30', UTC)).toBeNull();
    expect(zonedDayStartUtc('not-a-date', UTC)).toBeNull();
  });
});

describe('zonedDayRangeUtc', () => {
  it('spans exactly one local day', () => {
    for (const tz of [CAIRO, NEW_YORK, UTC, 'Asia/Kolkata']) {
      for (const day of [WINTER, SUMMER]) {
        const { start, end } = zonedDayRangeUtc(day, tz);
        expect(end - start).toBe(24 * 3600 * 1000);
      }
    }
  });

  it('is 23 hours across a spring-forward transition', () => {
    // 2026-03-08 is the US spring-forward date.
    const { start, end } = zonedDayRangeUtc('2026-03-08', NEW_YORK);
    expect((end - start) / 3600000).toBe(23);
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('is 25 hours across a fall-back transition', () => {
    // 2026-11-01 is the US fall-back date.
    const { start, end } = zonedDayRangeUtc('2026-11-01', NEW_YORK);
    expect((end - start) / 3600000).toBe(25);
  });

  it('never overlaps the neighbouring day', () => {
    const a = zonedDayRangeUtc('2026-03-08', NEW_YORK);
    const b = zonedDayRangeUtc('2026-03-09', NEW_YORK);
    expect(a.end.getTime()).toBe(b.start.getTime());
  });
});

describe('zonedToday', () => {
  it('reports the clinic-local day and its window', () => {
    // 2026-07-15T22:30Z is the 16th in Cairo but still the 15th in UTC.
    const now = Date.UTC(2026, 6, 15, 22, 30);
    const cairo = zonedToday(now, CAIRO);
    expect(cairo.dateStr).toBe('2026-07-16');
    const utc = zonedToday(now, UTC);
    expect(utc.dateStr).toBe('2026-07-15');
  });
});

describe('datetime-local round trip', () => {
  // The core of the original bug: a wall clock picked in the UI must map back
  // to the same wall clock for display, in every zone.
  const stamps = [
    '2026-01-15T09:00',
    '2026-07-15T09:00',
    '2026-03-08T01:30',
    '2026-11-01T01:30',
    '2026-06-30T23:45',
    '2026-12-31T23:59',
  ];
  const zones = [CAIRO, NEW_YORK, UTC, 'Asia/Kolkata', 'Australia/Sydney', 'Europe/London'];

  it.each(zones.flatMap((tz) => stamps.map((s) => [tz, s])))(
    'round-trips %s %s',
    (tz, stamp) => {
      const instant = fromDateTimeInputValue(stamp, tz);
      expect(instant).toBeInstanceOf(Date);
      expect(toDateTimeInputValue(instant, tz)).toBe(stamp);
    },
  );

  it('resolves the wall clock against the clinic zone, not the browser', () => {
    // 09:00 in Cairo during summer (UTC+3) is 06:00Z.
    expect(fromDateTimeInputValue('2026-07-15T09:00', CAIRO).toISOString())
      .toBe('2026-07-15T06:00:00.000Z');
    // 09:00 in New York during winter (UTC-5) is 14:00Z.
    expect(fromDateTimeInputValue('2026-01-15T09:00', NEW_YORK).toISOString())
      .toBe('2026-01-15T14:00:00.000Z');
  });

  it('lands on the correct side of a DST transition', () => {
    // 09:00 on the day the US springs forward is already EDT (UTC-4).
    expect(fromDateTimeInputValue('2026-03-08T09:00', NEW_YORK).toISOString())
      .toBe('2026-03-08T13:00:00.000Z');
    // The fall-back happens at 02:00 on 2026-11-01, so 09:00 that day is
    // already EST (UTC-5) while the day before is still EDT (UTC-4).
    expect(fromDateTimeInputValue('2026-10-31T09:00', NEW_YORK).toISOString())
      .toBe('2026-10-31T13:00:00.000Z');
    expect(fromDateTimeInputValue('2026-11-01T09:00', NEW_YORK).toISOString())
      .toBe('2026-11-01T14:00:00.000Z');
  });

  it('normalises a wall clock that the DST gap skips, deterministically', () => {
    // 02:30 on 2026-03-08 never happens in New York. It must still produce an
    // instant rather than throw or silently shift a whole day.
    const first = fromDateTimeInputValue('2026-03-08T02:30', NEW_YORK);
    const second = fromDateTimeInputValue('2026-03-08T02:30', NEW_YORK);
    expect(first.getTime()).toBe(second.getTime());
    expect(Number.isNaN(first.getTime())).toBe(false);
    expect(localDateString(first.getTime(), NEW_YORK)).toBe('2026-03-08');
  });

  it('passes through a value that already carries an offset', () => {
    expect(fromDateTimeInputValue('2026-07-15T06:00:00.000Z', CAIRO).toISOString())
      .toBe('2026-07-15T06:00:00.000Z');
  });

  it('rejects impossible and unparseable values', () => {
    expect(fromDateTimeInputValue('', CAIRO)).toBeNull();
    expect(fromDateTimeInputValue(null, CAIRO)).toBeNull();
    expect(fromDateTimeInputValue('2026-02-30T09:00', CAIRO)).toBeNull();
  });
});

describe('localDateTimeString', () => {
  it('uses 24-hour clock hours without a 24:00 artefact', () => {
    // Midnight must read as 00, not 24, or `datetime-local` rejects the value.
    const midnight = zonedDayStartUtc('2026-07-15', CAIRO);
    expect(localDateTimeString(midnight, CAIRO)).toBe('2026-07-15T00:00');
    expect(localDateTimeString(midnight, CAIRO)).not.toContain('T24:');
  });

  it('formats 23:45 rather than rolling to the next day', () => {
    const t = fromDateTimeInputValue('2026-07-15T23:45', CAIRO);
    expect(localDateTimeString(t.getTime(), CAIRO)).toBe('2026-07-15T23:45');
  });
});

describe('toDateInputValue', () => {
  it('returns an already date-only string unchanged', () => {
    // Re-reading a date-only string through a zone would shift it a day west
    // of UTC, so it must pass straight through.
    expect(toDateInputValue('2026-09-26', NEW_YORK)).toBe('2026-09-26');
    expect(toDateInputValue('2026-09-26', CAIRO)).toBe('2026-09-26');
  });

  it('converts an instant to the clinic-local day', () => {
    // 22:00Z on the 25th is the 26th in Cairo.
    const instant = Date.UTC(2026, 8, 25, 22, 0);
    expect(toDateInputValue(new Date(instant), CAIRO)).toBe('2026-09-26');
    expect(toDateInputValue(new Date(instant), UTC)).toBe('2026-09-25');
  });

  it('renders a clinic-local midnight as the same day, everywhere', () => {
    // This is what a Day Close row is: midnight in the clinic's zone. West of
    // the clinic it used to render as the previous day.
    for (const [tz, day] of [[CAIRO, '2026-09-26'], [NEW_YORK, '2026-09-26'], [UTC, '2026-09-26']]) {
      const start = zonedDayStartUtc(day, tz);
      expect(toDateInputValue(new Date(start), tz)).toBe(day);
    }
  });

  it('handles empty and invalid input', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('')).toBe('');
    expect(toDateInputValue('nonsense')).toBe('');
  });
});

describe('zonedMinutesOfDay', () => {
  it('reports the clinic-local position of an instant', () => {
    // 06:00Z is 09:00 in Cairo (UTC+3 in July) and 02:00 in New York (UTC-4 in
    // July, i.e. daylight time).
    const instant = Date.UTC(2026, 6, 15, 6, 0);
    expect(zonedMinutesOfDay(instant, CAIRO)).toBe(9 * 60);
    expect(zonedMinutesOfDay(instant, NEW_YORK)).toBe(2 * 60);
    expect(zonedMinutesOfDay(instant, UTC)).toBe(6 * 60);
  });

  it('is never negative, so a calendar grid cannot clamp a morning slot', () => {
    // A 09:00 Cairo appointment seen from New York is 01:00 there — under the
    // old browser-zone code this became a negative offset that Math.max(0, ..)
    // flattened to the top of the grid.
    const instant = fromDateTimeInputValue('2026-07-15T09:00', CAIRO).getTime();
    expect(zonedMinutesOfDay(instant, CAIRO)).toBe(9 * 60);
    expect(zonedMinutesOfDay(instant, CAIRO)).toBeGreaterThanOrEqual(0);
  });
});

describe('combineDateAndTime', () => {
  it('resolves separate date and time controls in the clinic zone', () => {
    expect(combineDateAndTime('2026-07-15', '14:30', CAIRO).toISOString())
      .toBe('2026-07-15T11:30:00.000Z');
  });

  it('defaults a missing time to midnight clinic time', () => {
    expect(combineDateAndTime('2026-07-15', '', CAIRO).toISOString())
      .toBe('2026-07-14T21:00:00.000Z');
  });

  it('returns null without a date', () => {
    expect(combineDateAndTime('', '09:00', CAIRO)).toBeNull();
  });
});

describe('clinic timezone registry', () => {
  beforeEach(() => {
    clearClinicTimeZone();
  });

  it('applies the zone the server sent', () => {
    expect(setClinicTimeZone(CAIRO)).toBe(CAIRO);
    expect(clinicTimeZone()).toBe(CAIRO);
  });

  it('honours the registered zone by default', () => {
    setClinicTimeZone(CAIRO);
    // 22:00Z is the next day in Cairo, so the default-zone helpers must agree.
    expect(localDateString(Date.UTC(2026, 8, 25, 22, 0))).toBe('2026-09-26');
    expect(toDateInputValue(new Date(zonedDayStartUtc('2026-09-26')))).toBe('2026-09-26');
  });

  it('falls back to a working zone for an invalid or missing value', () => {
    for (const bad of ['Not/AZone', '', null, undefined, 42]) {
      clearClinicTimeZone();
      expect(() => setClinicTimeZone(bad)).not.toThrow();
      expect(typeof clinicTimeZone()).toBe('string');
      expect(clinicTimeZone().length).toBeGreaterThan(0);
    }
  });

  it('does not let one clinic leak into the next', () => {
    // After a logout/tenant switch the zone must return to the browser default
    // rather than keep rendering the previous clinic's dates.
    const browserDefault = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    setClinicTimeZone(CAIRO);
    clearClinicTimeZone();
    expect(clinicTimeZone()).toBe(browserDefault || 'UTC');
  });

  it('takes the most recently set zone', () => {
    setClinicTimeZone(CAIRO);
    setClinicTimeZone(NEW_YORK);
    expect(clinicTimeZone()).toBe(NEW_YORK);
  });
});
