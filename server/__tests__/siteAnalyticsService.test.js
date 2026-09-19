import { beforeEach, describe, expect, it, vi } from "vitest";

const { modelFactory } = vi.hoisted(() => ({
  modelFactory: () => {
    class MockModel {}
    MockModel.countDocuments = vi.fn();
    MockModel.aggregate = vi.fn();
    MockModel.findById = vi.fn();
    return { default: MockModel };
  },
}));

vi.mock("../modules/site/tenant/subscription.model.js", () => modelFactory());
vi.mock("../modules/site/tenant/tenant.model.js", () => modelFactory());
vi.mock("../modules/users/user.model.js", () => modelFactory());
vi.mock("../modules/patients/patient.model.js", () => modelFactory());
vi.mock("../modules/appointments/appointment.model.js", () => modelFactory());
vi.mock("../modules/billing/invoice.model.js", () => modelFactory());
vi.mock("../modules/emr/clinicalNote.model.js", () => modelFactory());
vi.mock("../modules/emr/dentalChart.model.js", () => modelFactory());
vi.mock("../modules/users/branch.model.js", () => modelFactory());

import Subscription from "../modules/site/tenant/subscription.model.js";
import { getRevenueByPlan } from "../modules/site/analytics/siteAnalytics.service.js";

describe("getRevenueByPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups active subscriptions by plan into MRR rows", async () => {
    Subscription.aggregate.mockResolvedValue([
      { _id: "pro", count: 3, mrr: 297 },
      { _id: "basic", count: 2, mrr: 99 },
    ]);

    const rows = await getRevenueByPlan();

    expect(Subscription.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $match: { status: "active" } }),
        expect.objectContaining({ $group: { _id: "$plan", count: { $sum: 1 }, mrr: { $sum: "$monthlyAmount" } } }),
      ]),
    );
    expect(rows).toEqual([
      { plan: "pro", count: 3, mrr: 297 },
      { plan: "basic", count: 2, mrr: 99 },
    ]);
  });

  it("normalises yearly subscriptions into a monthly rate", async () => {
    Subscription.aggregate.mockResolvedValue([{ _id: "pro", count: 1, mrr: 83.25 }]);

    const rows = await getRevenueByPlan();

    expect(rows[0].mrr).toBe(83.25);
  });

  it("returns an empty list when there are no active subscriptions", async () => {
    Subscription.aggregate.mockResolvedValue([]);

    const rows = await getRevenueByPlan();

    expect(rows).toEqual([]);
  });
});