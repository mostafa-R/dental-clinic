/**
 * Formatter guards.
 *
 * Every one of these is called from table cells and list rows fed by optional
 * API fields (`trialEndsAt`, `acknowledgedAt`, usage ratios). A missing field
 * used to render "NaN" or, in `formatPercentage`'s case, throw a TypeError that
 * took down the whole row. "—" is the agreed "no value" marker.
 */

import { describe, expect, it } from "vitest";

import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercentage,
  getRelativeTime,
} from "../format";

describe("formatPercentage", () => {
  it("formats a real number", () => {
    expect(formatPercentage(42.35)).toBe("42.4%");
  });

  it("does not throw on a missing value", () => {
    // The regression: `value.toFixed` threw on null/undefined.
    expect(() => formatPercentage(undefined)).not.toThrow();
    expect(() => formatPercentage(null)).not.toThrow();
    expect(formatPercentage(undefined)).toBe("—");
    expect(formatPercentage(null)).toBe("—");
  });

  it("treats a blank string as missing, not as zero", () => {
    expect(formatPercentage("")).toBe("—");
  });

  it("accepts numeric strings from the API", () => {
    expect(formatPercentage("7.25")).toBe("7.3%");
  });
});

describe("formatCurrency", () => {
  it("formats a number", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("does not render a misleading $0.00 for a missing amount", () => {
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency("")).toBe("—");
  });

  it("still formats a genuine zero", () => {
    // 0 and "no value" must stay distinguishable.
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("accepts numeric strings", () => {
    expect(formatCurrency("19.99")).toBe("$19.99");
  });
});

describe("formatNumber", () => {
  it("formats a number", () => {
    expect(formatNumber(1234)).toBe("1,234");
  });

  it("returns the empty marker instead of NaN", () => {
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(NaN)).toBe("—");
  });
});

describe("date formatters", () => {
  it("return the empty marker for missing and unparseable values", () => {
    // `new Date(undefined)` is Invalid Date and used to make
    // Intl.DateTimeFormat throw a RangeError.
    for (const bad of [undefined, null, "", "not-a-date"]) {
      expect(() => formatDate(bad)).not.toThrow();
      expect(formatDate(bad)).toBe("—");
      expect(() => formatDateTime(bad)).not.toThrow();
      expect(formatDateTime(bad)).toBe("—");
    }
  });

  it("do not turn a missing value into the epoch", () => {
    // `new Date(null)` is 1970-01-01, which rendered as a real date.
    expect(formatDate(null)).not.toContain("1970");
  });

  it("format a valid date", () => {
    expect(formatDate("2024-03-15T00:00:00Z")).toMatch(/2024/);
  });
});

describe("getRelativeTime", () => {
  it("returns the empty marker for missing values", () => {
    expect(getRelativeTime(undefined)).toBe("—");
    expect(getRelativeTime(null)).toBe("—");
  });

  it("describes a recent instant", () => {
    expect(getRelativeTime(new Date())).toBe("just now");
  });

  it("supports Arabic", () => {
    expect(getRelativeTime(new Date(), "ar")).toBe("الآن");
  });
});
