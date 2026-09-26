import { describe, expect, it } from 'vitest';

import { zonedDayRangeUtc, zonedDayStartUtc, localDateString } from '../utils/zonedDates.js';
import { dayCloseQuerySchema, closeDaySchema, listDayCloseQuerySchema } from '../modules/accounting/accounting.validator.js';

/**
 * Day Close identifies a *local calendar day of the clinic*. It used to be
 * folded with the server's `date.setHours(0, 0, 0, 0)`, which made both the
 * reconciliation window and the `{ branch, date }` unique-index key depend on
 * the machine the server happened to run on.
 *
 * These tests pin the properties that fix must hold:
 *   1. The window is derived from the clinic's IANA zone, not the server's.
 *   2. It is the same window no matter what `process.env.TZ` says.
 *   3. It covers the full local day, including DST-short/long days.
 *   4. The date-only contract is enforced at the edge.
 */

const HOUR = 3600_000;

/** The old, buggy behaviour, kept here to assert the fix actually changes it. */
function serverLocalDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

describe('day-close window is anchored to the clinic timezone', () => {
  it('resolves local midnight for a non-UTC clinic', () => {
    // Africa/Cairo is UTC+3 year-round (no DST since 2023).
    const range = zonedDayRangeUtc('2026-09-26', 'Africa/Cairo');
    expect(range.start.toISOString()).toBe('2026-09-25T21:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-09-26T21:00:00.000Z');
  });

  it('spans exactly one clinic-local day', () => {
    const range = zonedDayRangeUtc('2026-09-26', 'Africa/Cairo');
    expect(range.end.getTime() - range.start.getTime()).toBe(24 * HOUR);
  });

  it('is end-exclusive so an adjacent day is not double counted', () => {
    const today = zonedDayRangeUtc('2026-09-26', 'Africa/Cairo');
    const next = zonedDayRangeUtc('2026-09-27', 'Africa/Cairo');
    // A payment at the very last instant of the day belongs to `today`; the
    // next day's window must start exactly where this one ends.
    expect(today.end.getTime()).toBe(next.start.getTime());
    expect(today.end.getTime()).toBeLessThanOrEqual(next.start.getTime());
  });

  it('handles a DST-short day without losing or duplicating an hour', () => {
    // 2026-03-08 is the US spring-forward day: the local day is 23 hours long.
    const range = zonedDayRangeUtc('2026-03-08', 'America/New_York');
    expect(range.end.getTime() - range.start.getTime()).toBe(23 * HOUR);
    expect(range.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('handles a DST-long day', () => {
    // 2026-11-01 is the US fall-back day: the local day is 25 hours long.
    const range = zonedDayRangeUtc('2026-11-01', 'America/New_York');
    expect(range.end.getTime() - range.start.getTime()).toBe(25 * HOUR);
  });

  it('produces the same window regardless of the server OS timezone', () => {
    const original = process.env.TZ;
    try {
      const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((tz) => {
        process.env.TZ = tz;
        return zonedDayRangeUtc('2026-09-26', 'Africa/Cairo');
      });
      const first = results[0];
      for (const r of results) {
        expect(r.start.toISOString()).toBe(first.start.toISOString());
        expect(r.end.toISOString()).toBe(first.end.toISOString());
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('re-anchors away from the old server-local spelling', () => {
    // Regression guard: the two spellings of "the same day" must not both be
    // reachable, or the unique index on { branch, date } would let a second
    // close slip past the "already closed?" check.
    const buggy = serverLocalDay('2026-09-26');
    const fixed = zonedDayRangeUtc('2026-09-26', 'Africa/Cairo');

    // The fixed window always starts on that day *in the clinic's zone*.
    expect(localDateString(fixed.start.getTime(), 'Africa/Cairo')).toBe('2026-09-26');
    // The old one only does so when the server happens to run in that zone.
    const serverWasAlreadyCorrect =
      localDateString(buggy.start.getTime(), 'Africa/Cairo') === '2026-09-26';
    if (!serverWasAlreadyCorrect) {
      expect(fixed.start.getTime()).not.toBe(buggy.start.getTime());
    }
  });

  it('round-trips the day label through the window it came from', () => {
    for (const tz of ['UTC', 'Africa/Cairo', 'America/New_York', 'Asia/Tokyo']) {
      for (const day of ['2026-01-01', '2026-03-08', '2026-06-15', '2026-11-01', '2026-12-31']) {
        const start = zonedDayStartUtc(day, tz);
        expect(localDateString(start, tz)).toBe(day);
      }
    }
  });

  it('rejects impossible calendar dates', () => {
    expect(zonedDayRangeUtc('2026-02-30', 'UTC')).toBeNull();
    expect(zonedDayRangeUtc('2026-13-01', 'UTC')).toBeNull();
    expect(zonedDayRangeUtc('not-a-date', 'UTC')).toBeNull();
    expect(zonedDayRangeUtc(20260926, 'UTC')).toBeNull();
  });

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    const range = zonedDayRangeUtc('2026-09-26', 'Mars/Olympus_Mons');
    expect(range.start.toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });
});

describe('day-close endpoints accept a date-only selector', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(dayCloseQuerySchema.parse({ date: '2026-09-26' }).date).toBe('2026-09-26');
    expect(closeDaySchema.parse({ countedCash: 100, date: '2026-09-26' }).date).toBe('2026-09-26');
    expect(listDayCloseQuerySchema.parse({ from: '2026-01-01', to: '2026-01-31' }).to).toBe('2026-01-31');
  });

  it('rejects a full datetime — the old server-local fold depended on accepting it', () => {
    const parsed = dayCloseQuerySchema.safeParse({ date: '2026-09-26T00:00:00.000Z' });
    expect(parsed.success).toBe(false);
  });

  it('rejects other junk', () => {
    expect(dayCloseQuerySchema.safeParse({ date: '2026/09/26' }).success).toBe(false);
    expect(listDayCloseQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false);
  });

  it('still allows omitting the date (server resolves clinic "today")', () => {
    expect(dayCloseQuerySchema.parse({}).date).toBeUndefined();
    expect(closeDaySchema.parse({ countedCash: 0 }).date).toBeUndefined();
  });
});
