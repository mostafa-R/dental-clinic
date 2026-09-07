/**
 * Regression tests for the week-view calendar timezone bug (CRITICAL).
 *
 * The old code parsed date-only query params (`from`/`to`) as UTC midnight
 * while day view folded them to LOCAL midnight. For any clinic east of UTC the
 * effective window shifted forward by the clinic's UTC offset, silently
 * dropping the entire tail of the last day of the week.
 *
 * All assertions are timezone-fixture based: they run against a fixed
 * non-UTC, positive-offset clinic timezone (Africa/Cairo, UTC+3 in effect)
 * and the expected boundaries are derived from `Intl` at runtime, so the test
 * is deterministic regardless of (a) the machine's OS timezone and (b) any DST
 * rules being in effect for the fixture date.
 */

import { describe, expect, it } from "vitest";
import {
  buildDateRangeFilter,
  isDateOnlyString,
  localDateString,
  parseDateOnly,
  zonedDayRangeUtc,
  zonedDayStartUtc,
  zonedNextDayStartUtc,
  zonedOffsetMs,
  zonedTodayRangeUtc,
} from "../utils/zonedDates.js";
import { normalizeTimeZone } from "../utils/timezoneUtils.js";

const CAIRO = "Africa/Cairo";

// A week in September 2026. Cairo is UTC+3 in this period (DST in force
// between ~last Friday of April and ~last Thursday of October).
const ANCHOR = "2026-09-07"; // Monday
const END_OF_WEEK = "2026-09-13"; // Sunday

describe("zoned day boundaries (Africa/Cairo fixture)", () => {
  it("start of a local day lands on the correct UTC instant east of UTC", () => {
    const start = zonedDayStartUtc(ANCHOR, CAIRO);
    const expectedOffset = zonedOffsetMs(Date.UTC(2026, 8, 7, 12), CAIRO);
    // Local midnight in +03 == previous day 21:00 UTC.
    expect(start).toBe(Date.UTC(2026, 8, 6, 21, 0, 0));
    expect(start).toBe(Date.UTC(2026, 8, 7) - expectedOffset);
  });

  it("keeps the whole week including its last day inside the window (the regression)", () => {
    const filter = buildDateRangeFilter(
      { date: "", from: ANCHOR, to: END_OF_WEEK },
      CAIRO,
    );
    expect(filter.start.$gte).toBeInstanceOf(Date);
    expect(filter.start.$lt).toBeInstanceOf(Date);

    // Local 10:00 on the LAST day of the week (Sunday) — this appointment was
    // dropped by the old bug because the window ended at END_OF_WEEK 00:00 UTC,
    // which is 03:00 local Sunday.
    const lastDayLocal10 =
      Date.UTC(2026, 8, 13, 10, 0, 0) - zonedOffsetMs(Date.UTC(2026, 8, 13, 10), CAIRO);

    expect(filter.start.$gte.getTime()).toBeLessThanOrEqual(lastDayLocal10);
    expect(filter.start.$lt.getTime()).toBeGreaterThan(lastDayLocal10);
  });

  it("proves the fix differs from the old (UTC-midnight) window on the last day", () => {
    const cairoFilter = buildDateRangeFilter({ date: "", from: ANCHOR, to: END_OF_WEEK }, CAIRO);
    // Old behavior: `to` parsed as UTC midnight, i.e. END_OF_WEEK 00:00Z.
    const oldUpperBound = Date.UTC(2026, 8, 13, 0, 0, 0);

    expect(cairoFilter.start.$lt.getTime()).toBeGreaterThan(oldUpperBound);

    // And an appointment at local 10:00 on the last day is outside the OLD
    // window — i.e. exactly what the bug "9am-10am local" mis-folding caused.
    const lastDayLocal10 =
      Date.UTC(2026, 8, 13, 10, 0, 0) - zonedOffsetMs(Date.UTC(2026, 8, 13, 10), CAIRO);
    expect(lastDayLocal10).toBeGreaterThan(oldUpperBound);
  });

  it("an exact-instant `to` value is still tolerated (full ISO not folded)", () => {
    const filter = buildDateRangeFilter(
      { date: "", from: ANCHOR, to: `${END_OF_WEEK}T17:30:00.000Z` },
      CAIRO,
    );
    expect(filter.start.$lte).toBeInstanceOf(Date);
    expect(filter.start.$lte.toISOString()).toBe(`${END_OF_WEEK}T17:30:00.000Z`);
  });

  it("the whole local day is inside [start, end) even across a DST shift", () => {
    const range = zonedDayRangeUtc(ANCHOR, CAIRO);
    const lengthMs = range.end.getTime() - range.start.getTime();
    expect(lengthMs).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(lengthMs).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it("zonedNextDayStartUtc advances by a full local day", () => {
    const start = zonedDayStartUtc(ANCHOR, CAIRO);
    const next = zonedNextDayStartUtc(start, CAIRO);
    expect(next).toBe(zonedDayStartUtc("2026-09-08", CAIRO));
  });
});

describe("zonedTodayRangeUtc", () => {
  it("derives the local date string in the clinic timezone, not the server's", () => {
    // 2026-09-07T22:30:00Z is 2026-09-08 01:30 in Cairo.
    const now = Date.UTC(2026, 8, 7, 22, 30, 0);
    const cairo = zonedTodayRangeUtc(now, CAIRO);
    expect(cairo.dateStr).toBe("2026-09-08");
    expect(cairo.start.toISOString()).toBe("2026-09-07T21:00:00.000Z");
    expect(cairo.end.toISOString()).toBe("2026-09-08T21:00:00.000Z");

    const utc = zonedTodayRangeUtc(now, "UTC");
    expect(utc.dateStr).toBe("2026-09-07");
  });
});

describe("parse/isDateOnlyString", () => {
  it("only accepts strict YYYY-MM-DD", () => {
    expect(isDateOnlyString("2026-09-07")).toBe(true);
    expect(isDateOnlyString("2026-09-07T00:00:00.000Z")).toBe(false);
    expect(isDateOnlyString("07/09/2026")).toBe(false);
    expect(parseDateOnly("2026-09-07")).toEqual({ y: 2026, mo: 9, d: 7 });
    expect(parseDateOnly("2026-02-30")).toBeNull();
    expect(parseDateOnly("nope")).toBeNull();
  });
});

describe("normalizeTimeZone", () => {
  it("falls back to UTC for unknown/invalid zones", () => {
    expect(normalizeTimeZone("Africa/Cairo")).toBe("Africa/Cairo");
    expect(normalizeTimeZone(undefined)).toBe("UTC");
    expect(normalizeTimeZone("Not/AZone")).toBe("UTC");
    expect(normalizeTimeZone("'")).toBe("UTC");
  });
});

describe("localDateString", () => {
  it("maps an instant to the local wall date in the given zone", () => {
    const instant = Date.UTC(2026, 8, 7, 23, 59, 59); // 2026-09-08 02:59:59 Cairo
    expect(localDateString(instant, CAIRO)).toBe("2026-09-08");
    expect(localDateString(instant, "UTC")).toBe("2026-09-07");
  });
});