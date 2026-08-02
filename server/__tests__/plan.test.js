import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/platform/plan.model.js", () => {
  class MockPlan {}
  MockPlan.findById = vi.fn();
  MockPlan.countDocuments = vi.fn();
  return { default: MockPlan };
});

vi.mock("../modules/site/tenant/tenant.model.js", () => ({
  default: { find: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("../modules/site/tenant/subscription.model.js", () => ({
  default: { find: vi.fn() },
}));

vi.mock("../modules/site/subscription/subscription.service.js", () => ({
  getPlanPrice: vi.fn(),
}));

import { updatePlan } from "../modules/platform/plan.service.js";
import Plan from "../modules/platform/plan.model.js";
import Tenant from "../modules/site/tenant/tenant.model.js";
import Subscription from "../modules/site/tenant/subscription.model.js";
import { getPlanPrice } from "../modules/site/subscription/subscription.service.js";

function makePlan(overrides = {}) {
  const plan = {
    _id: "p1",
    key: "pro",
    name: "Pro",
    price: 99,
    interval: "month",
    modules: ["dashboard", "patients", "appointments", "billing"],
    limits: { maxBranches: 1, maxDoctors: 3, maxPatients: 500, storage: "5GB" },
    save: vi.fn(),
    toObject: vi.fn(),
    ...overrides,
  };
  plan.toObject.mockImplementation(() => ({
    _id: plan._id,
    key: plan.key,
    name: plan.name,
    price: plan.price,
    interval: plan.interval,
    modules: plan.modules,
    limits: plan.limits,
  }));
  plan.save.mockResolvedValue(plan);
  return plan;
}

function makeSub({ billingCycle = "monthly" } = {}) {
  const sub = { _id: "s1", plan: "pro", billingCycle, amount: 0, save: vi.fn() };
  sub.save.mockResolvedValue(sub);
  return sub;
}

describe("updatePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Tenant.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  it("preserves sibling limits when only one limit key is patched", async () => {
    const plan = makePlan();
    vi.mocked(Plan.findById).mockResolvedValue(plan);
    vi.mocked(Tenant.updateMany).mockResolvedValue({ modifiedCount: 1 });

    await updatePlan("p1", { limits: { maxDoctors: 10 } });

    expect(plan.limits).toEqual({
      maxBranches: 1,
      maxDoctors: 10,
      maxPatients: 500,
      storage: "5GB",
    });
    expect(Tenant.updateMany).toHaveBeenCalledWith(
      { planId: "p1" },
      {
        $set: {
          "settings.maxBranches": 1,
          "settings.maxDoctors": 10,
          "settings.maxPatients": 500,
          plan: "pro",
          planId: "p1",
          planModules: plan.modules,
        },
      },
    );
  });

  it("recomputes subscription amounts when the plan price changes", async () => {
    const plan = makePlan({ price: 199 });
    vi.mocked(Plan.findById).mockResolvedValue(plan);
    vi.mocked(Tenant.updateMany).mockResolvedValue({ modifiedCount: 1 });

    const monthly = makeSub({ billingCycle: "monthly" });
    const yearly = makeSub({ billingCycle: "yearly" });
    vi.mocked(Subscription.find).mockReturnValue({
      select: vi.fn().mockResolvedValue([monthly, yearly]),
    });
    vi.mocked(getPlanPrice).mockResolvedValue(199);

    await updatePlan("p1", { price: 199 });

    expect(Subscription.find).toHaveBeenCalledWith({ plan: "pro" });
    expect(getPlanPrice).toHaveBeenCalledWith("pro", "monthly");
    expect(getPlanPrice).toHaveBeenCalledWith("pro", "yearly");
    expect(monthly.save).toHaveBeenCalled();
    expect(yearly.save).toHaveBeenCalled();
    expect(monthly.amount).toBe(199);
  });

  it("does not touch subscriptions when only limits change", async () => {
    const plan = makePlan();
    vi.mocked(Plan.findById).mockResolvedValue(plan);
    vi.mocked(Tenant.updateMany).mockResolvedValue({ modifiedCount: 1 });

    await updatePlan("p1", { limits: { maxBranches: 5 } });

    expect(Subscription.find).not.toHaveBeenCalled();
    expect(getPlanPrice).not.toHaveBeenCalled();
  });

  it("throws notFound when the plan does not exist", async () => {
    vi.mocked(Plan.findById).mockResolvedValue(null);

    await expect(updatePlan("missing", { name: "X" })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(Tenant.updateMany).not.toHaveBeenCalled();
  });
});
