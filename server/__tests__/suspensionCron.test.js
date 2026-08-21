import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/platform/platformSetting.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../modules/site/tenant/subscription.model.js", () => ({
  default: { find: vi.fn(), findByIdAndUpdate: vi.fn() },
}));

vi.mock("../modules/site/tenant/tenant.model.js", () => ({
  default: { findByIdAndUpdate: vi.fn() },
}));

vi.mock("../utils/cache.js", () => ({
  invalidateTenant: vi.fn(),
}));

vi.mock("../core/transaction.js", () => ({
  withTransaction: vi.fn(async (fn) => fn({})),
}));

import PlatformSetting from "../modules/platform/platformSetting.model.js";
import Subscription from "../modules/site/tenant/subscription.model.js";
import Tenant from "../modules/site/tenant/tenant.model.js";
import { invalidateTenant } from "../utils/cache.js";
import { checkAndSuspend } from "../services/suspensionCron.js";

function subscriptionQuery(overdue) {
  return {
    populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(overdue) }),
  };
}

function settingQuery(value) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe("suspensionCron - checkAndSuspend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suspends overdue tenants and invalidates the cached tenant immediately", async () => {
    PlatformSetting.findOne.mockReturnValue(settingQuery({ autoSuspendDays: 30 }));
    const overdue = [
      {
        _id: "s1",
        tenant: { _id: "t1", name: "Clinic A" },
        nextPaymentAt: new Date("2020-01-01"),
      },
      {
        _id: "s2",
        tenant: { _id: "t2", name: "Clinic B" },
        nextPaymentAt: new Date("2020-01-01"),
      },
    ];
    Subscription.find.mockReturnValue(subscriptionQuery(overdue));

    await checkAndSuspend();

    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith("t1", {
      status: "suspended",
      isActive: false,
    });
    expect(Tenant.findByIdAndUpdate).toHaveBeenCalledWith("t2", {
      status: "suspended",
      isActive: false,
    });
    expect(Subscription.findByIdAndUpdate).toHaveBeenCalledWith("s1", { status: "past_due" });
    expect(Subscription.findByIdAndUpdate).toHaveBeenCalledWith("s2", { status: "past_due" });
    expect(invalidateTenant).toHaveBeenCalledTimes(2);
    expect(invalidateTenant).toHaveBeenCalledWith("t1");
    expect(invalidateTenant).toHaveBeenCalledWith("t2");
  });

  it("skips overdue subscriptions without a tenant and never invalidates cache", async () => {
    PlatformSetting.findOne.mockReturnValue(settingQuery(null));
    const overdue = [{ _id: "s1", tenant: null, nextPaymentAt: new Date("2020-01-01") }];
    Subscription.find.mockReturnValue(subscriptionQuery(overdue));

    await checkAndSuspend();

    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(Subscription.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(invalidateTenant).not.toHaveBeenCalled();
  });

  it("does nothing when no tenants are overdue", async () => {
    PlatformSetting.findOne.mockReturnValue(settingQuery({ autoSuspendDays: 30 }));
    Subscription.find.mockReturnValue(subscriptionQuery([]));

    await checkAndSuspend();

    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(invalidateTenant).not.toHaveBeenCalled();
  });

  it("falls back to the default 30-day grace period when no setting exists", async () => {
    PlatformSetting.findOne.mockReturnValue(settingQuery(null));
    Subscription.find.mockReturnValue(subscriptionQuery([]));

    await checkAndSuspend();

    const [filter] = Subscription.find.mock.calls[0];
    expect(filter.nextPaymentAt.$lt).toBeInstanceOf(Date);
    const msDiff = Date.now() - filter.nextPaymentAt.$lt.getTime();
    expect(msDiff).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000);
  });
});

