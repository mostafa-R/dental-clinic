import { describe, expect, it } from "vitest";

import {
  createDrawingSchema,
  createExpenseSchema,
  listCommissionQuerySchema,
  listDayCloseQuerySchema,
  listDrawingQuerySchema,
  listExpenseQuerySchema,
  accountingSummaryQuerySchema,
  dayCloseQuerySchema,
  closeDaySchema,
  generateInvoiceSchema,
  payCommissionSchema,
} from "../modules/accounting/accounting.validator.js";

const OID = "6650c0ffee00000000000001";

describe("createExpenseSchema (wallet linkage guard)", () => {
  it("accepts an expense paid by cash", () => {
    const result = createExpenseSchema.safeParse({
      category: "supplies",
      description: "Gloves",
      amount: 25,
      paymentMethod: "cash",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an expense paid from a patient wallet (no linkage exists)", () => {
    const result = createExpenseSchema.safeParse({
      category: "supplies",
      description: "Gloves",
      amount: 25,
      paymentMethod: "wallet",
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["paymentMethod"]);
  });

  it("rejects an invalid category, zero amount, and missing description", () => {
    const result = createExpenseSchema.safeParse({
      category: "snacks",
      description: "",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("listExpenseQuerySchema", () => {
  it("applies pagination defaults", () => {
    const result = listExpenseQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(50);
  });

  it("accepts a category + date-range filter", () => {
    const result = listExpenseQuerySchema.safeParse({
      page: "2",
      limit: "25",
      category: "rent",
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-02-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(2);
    expect(result.data.limit).toBe(25);
  });

  it("rejects an over-limit limit and an invalid category", () => {
    expect(listExpenseQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
    expect(listExpenseQuerySchema.safeParse({ category: "nope" }).success).toBe(false);
  });
});

describe("createDrawingSchema", () => {
  const base = { owner: OID, amount: 50 };

  it("accepts a valid owner drawing", () => {
    const result = createDrawingSchema.safeParse({ ...base, paymentMethod: "bank" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing owner and a non-positive amount", () => {
    expect(createDrawingSchema.safeParse({ amount: 50 }).success).toBe(false);
    expect(createDrawingSchema.safeParse({ owner: OID, amount: 0 }).success).toBe(false);
  });

  it("rejects an invalid owner id and invalid datetime", () => {
    expect(createDrawingSchema.safeParse({ ...base, owner: "abc" }).success).toBe(false);
    expect(createDrawingSchema.safeParse({ ...base, date: "2025-sometime" }).success).toBe(false);
  });
});

describe("listDrawingQuerySchema", () => {
  it("applies pagination defaults", () => {
    const result = listDrawingQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(50);
  });

  it("rejects an out-of-range limit", () => {
    expect(listDrawingQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("listCommissionQuerySchema", () => {
  it("accepts a doctor + status filter", () => {
    const result = listCommissionQuerySchema.safeParse({ doctor: OID, status: "paid" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status and an invalid doctor id", () => {
    expect(listCommissionQuerySchema.safeParse({ status: "overdue" }).success).toBe(false);
    expect(listCommissionQuerySchema.safeParse({ doctor: "zzz" }).success).toBe(false);
  });
});

describe("payCommissionSchema", () => {
  it("accepts only the paid status", () => {
    expect(payCommissionSchema.safeParse({ status: "paid" }).success).toBe(true);
    expect(payCommissionSchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});

describe("generateInvoiceSchema", () => {
  it("accepts item ids with optional discount/tax/notes", () => {
    const result = generateInvoiceSchema.safeParse({
      itemIds: [OID, OID],
      discount: 10,
      tax: 5,
      notes: "Surgical kit",
    });
    expect(result.success).toBe(true);
  });

  it("requires at least one item and caps the list at 100", () => {
    expect(generateInvoiceSchema.safeParse({ itemIds: [] }).success).toBe(false);
    expect(generateInvoiceSchema.safeParse({ itemIds: Array(101).fill(OID) }).success).toBe(false);
  });

  it("rejects a negative discount", () => {
    expect(generateInvoiceSchema.safeParse({ itemIds: [OID], discount: -1 }).success).toBe(false);
  });
});

describe("accountingSummaryQuerySchema", () => {
  it("accepts an empty query and a date range", () => {
    expect(accountingSummaryQuerySchema.safeParse({}).success).toBe(true);
    const result = accountingSummaryQuerySchema.safeParse({
      from: "2025-01-01T00:00:00.000Z",
      to: "2025-02-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(accountingSummaryQuerySchema.safeParse({ from: "yesterday" }).success).toBe(false);
  });
});

describe("dayCloseQuerySchema", () => {
  it("accepts an empty query and a branch filter", () => {
    expect(dayCloseQuerySchema.safeParse({}).success).toBe(true);
    expect(dayCloseQuerySchema.safeParse({ branch: OID }).success).toBe(true);
  });
});

describe("closeDaySchema", () => {
  it("accepts a day close with counted cash", () => {
    const result = closeDaySchema.safeParse({ countedCash: 1200.5, notes: "All good", branch: OID });
    expect(result.success).toBe(true);
  });

  it("rejects a negative counted cash", () => {
    const result = closeDaySchema.safeParse({ countedCash: -5 });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(["countedCash"]);
  });
});

describe("listDayCloseQuerySchema", () => {
  it("applies pagination defaults", () => {
    const result = listDayCloseQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(50);
  });

  it("rejects an out-of-range limit", () => {
    expect(listDayCloseQuerySchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
});