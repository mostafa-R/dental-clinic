import { describe, expect, it } from "vitest";

import { createExpenseSchema } from "../modules/accounting/accounting.validator.js";

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
  });
});
