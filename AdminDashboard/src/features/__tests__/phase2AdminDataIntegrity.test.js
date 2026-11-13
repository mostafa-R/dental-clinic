import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("../../lib/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from "../../lib/axios";
import alertsReducer, {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  fetchAlertById,
  resolveAlert,
} from "../alerts/alertsSlice";
import branchesReducer, {
  createBranch,
  deleteBranch,
  updateBranch,
} from "../branches/branchesSlice";
import errorLogsReducer, {
  resolveErrorLog,
} from "../errorLogs/errorLogsSlice";
import quarantineReducer, {
  fetchAbuseChecks,
  removeQuarantine,
  setQuarantine,
} from "../quarantine/quarantineSlice";
import tenantsReducer, {
  activateTenant,
  archiveTenant,
  deleteTenant,
  suspendTenant,
  updateTenant,
} from "../tenants/tenantsSlice";
import subscriptionsReducer, {
  createSubscription,
  fetchRevenueStats,
  fetchSubscriptions,
  processPayment,
  updateSubscription,
} from "../subscriptions/subscriptionsSlice";

const storeFor = (reducer, preloadedState) =>
  configureStore({ reducer, preloadedState });

const init = (reducer) => reducer(undefined, { type: "@@INIT" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("phase 2 admin/data integrity mutation handling", () => {
  it("tenantsSlice records rejected lifecycle mutations without clearing existing items", () => {
    const seeded = {
      ...init(tenantsReducer),
      items: [{ _id: "t1", status: "active", name: "Clinic A" }],
    };

    const cases = [
      [updateTenant, { id: "t1", data: { name: "X" } }, "update failed"],
      [suspendTenant, "t1", "suspend failed"],
      [activateTenant, "t1", "activate failed"],
      [archiveTenant, "t1", "archive failed"],
      [deleteTenant, "t1", "delete failed"],
    ];

    for (const [thunk, arg, msg] of cases) {
      const pendingState = tenantsReducer(seeded, { type: thunk.pending.type, meta: { arg } });
      const state = tenantsReducer(pendingState, { type: thunk.rejected.type, payload: msg, meta: { arg } });
      expect(state.error).toBe(msg);
      expect(state.items).toEqual(seeded.items);
    }
  });

  it("branchesSlice records rejected create/update/delete mutations without mutating items", () => {
    const seeded = {
      ...init(branchesReducer),
      items: [{ _id: "b1", name: "Main", tenant: "t1" }],
    };

    const rejectedCreate = branchesReducer(seeded, {
      type: createBranch.rejected.type,
      payload: "create failed",
      meta: { arg: { name: "New" } },
    });
    expect(rejectedCreate.error).toBe("create failed");
    expect(rejectedCreate.items).toEqual(seeded.items);

    const rejectedUpdate = branchesReducer(seeded, {
      type: updateBranch.rejected.type,
      payload: "update failed",
      meta: { arg: { id: "b1", data: { name: "X" } } },
    });
    expect(rejectedUpdate.error).toBe("update failed");
    expect(rejectedUpdate.items).toEqual(seeded.items);

    const rejectedDelete = branchesReducer(seeded, {
      type: deleteBranch.rejected.type,
      payload: "delete failed",
      meta: { arg: "b1" },
    });
    expect(rejectedDelete.error).toBe("delete failed");
    expect(rejectedDelete.items).toEqual(seeded.items);
  });

  it("errorLogsSlice keeps logs intact and surfaces rejection when resolve fails", () => {
    const seeded = {
      ...init(errorLogsReducer),
      logs: [{ _id: "e1", message: "boom", resolved: false }],
      resolvingId: null,
      error: null,
    };

    const pendingState = errorLogsReducer(seeded, {
      type: resolveErrorLog.pending.type,
      meta: { arg: "e1" },
    });
    expect(pendingState.resolvingId).toBe("e1");
    expect(pendingState.error).toBeNull();

    const failed = errorLogsReducer(pendingState, {
      type: resolveErrorLog.rejected.type,
      payload: "resolve failed",
      meta: { arg: "e1" },
    });
    expect(failed.resolvingId).toBeNull();
    expect(failed.error).toBe("resolve failed");
    expect(failed.logs).toEqual(seeded.logs);
  });

  it("alertsSlice updates detail on fulfilled mutation and preserves state on rejection", () => {
    const alert = { _id: "a1", status: "active", tenant: "t1" };
    const seeded = {
      ...init(alertsReducer),
      alerts: [alert],
      active: [alert],
      detail: { _id: "a1", status: "active" },
      summary: { open: 1, active: 1, acknowledged: 0, resolved: 0 },
    };

    const ackFulfilled = alertsReducer(seeded, {
      type: acknowledgeAlert.fulfilled.type,
      payload: { alert: { ...alert, status: "acknowledged" } },
      meta: { arg: "a1" },
    });
    expect(ackFulfilled.alerts[0].status).toBe("acknowledged");
    expect(ackFulfilled.detail.status).toBe("acknowledged");

    const resolveRejected = alertsReducer(seeded, {
      type: resolveAlert.rejected.type,
      payload: "resolve failed",
      meta: { arg: "a1" },
    });
    expect(resolveRejected.error).toBe("resolve failed");
    expect(resolveRejected.managingId).toBeNull();
    expect(resolveRejected.alerts).toEqual(seeded.alerts);
    expect(resolveRejected.detail).toEqual(seeded.detail);
  });

  it("alertsSlice does not zero summary on acknowledge-all; reconciliation is server-driven", () => {
    const seeded = {
      ...init(alertsReducer),
      alerts: [{ _id: "a1", status: "active" }, { _id: "a2", status: "resolved" }],
      active: [{ _id: "a1", status: "active" }],
      summary: { open: 3, active: 2, acknowledged: 1, resolved: 5 },
    };

    const state = alertsReducer(seeded, {
      type: acknowledgeAllAlerts.fulfilled.type,
      payload: { ok: true },
      meta: { arg: undefined },
    });

    expect(state.active).toEqual([]);
    expect(state.alerts[0].status).toBe("acknowledged");
    // Summary remains until explicit fetchAlertSummary reconciliation.
    expect(state.summary).toEqual(seeded.summary);
  });

  it("quarantineSlice tracks mutation state, errors on rejection, and never mutates on failure", () => {
    const seeded = {
      ...init(quarantineReducer),
      checks: [{ tenantId: "t1", name: "Clinic", quarantined: false, warnings: [] }],
    };

    const setPending = quarantineReducer(seeded, {
      type: setQuarantine.pending.type,
      meta: { arg: { tenantId: "t1", reason: "abuse" } },
    });
    expect(setPending.mutatingId).toBe("t1");
    expect(setPending.error).toBeNull();

    const setRejected = quarantineReducer(setPending, {
      type: setQuarantine.rejected.type,
      payload: "set failed",
      meta: { arg: { tenantId: "t1", reason: "abuse" } },
    });
    expect(setRejected.mutatingId).toBeNull();
    expect(setRejected.error).toBe("set failed");
    expect(setRejected.checks).toEqual(seeded.checks);

    const removeRejected = quarantineReducer(
      {
        ...seeded,
        checks: [{ tenantId: "t1", name: "Clinic", quarantined: true, warnings: [] }],
        mutatingId: "t1",
      },
      {
        type: removeQuarantine.rejected.type,
        payload: "remove failed",
        meta: { arg: "t1" },
      },
    );
    expect(removeRejected.error).toBe("remove failed");
    expect(removeRejected.checks[0].quarantined).toBe(true);
  });

  it("subscriptions mutations surface rejections and keep state for reconciliation flows", async () => {
    api.put.mockRejectedValue({ response: { data: { message: "2FA required" } } });
    api.post.mockRejectedValue({ response: { data: { message: "payment failed" } } });

    const store = storeFor(subscriptionsReducer, {
      ...init(subscriptionsReducer),
      items: [{ _id: "s1", tenant: "t1", amount: 99, status: "active" }],
    });

    await store.dispatch(updateSubscription({ id: "s1", data: { plan: "pro" } }));
    expect(store.getState().error).toBe("2FA required");
    expect(store.getState().items[0].plan).toBeUndefined();

    await store.dispatch(processPayment({ tenantId: "t1", data: { amount: 99 } }));
    expect(store.getState().error).toBe("payment failed");
  });

  it("successful billing mutations dispatchable for post-success reconciliation", async () => {
    api.get.mockResolvedValueOnce({ data: { totalRevenue: 10 } });
    api.get.mockResolvedValueOnce({ data: [{ _id: "s1" }] });

    const store = storeFor({
      subscriptions: subscriptionsReducer,
    });

    await store.dispatch(fetchRevenueStats());
    await store.dispatch(fetchSubscriptions());

    expect(api.get).toHaveBeenCalledWith("/subscriptions/revenue");
    expect(api.get).toHaveBeenCalledWith("/subscriptions", { params: undefined });
    expect(store.getState().subscriptions.revenueStats.totalRevenue).toBe(10);
    expect(store.getState().subscriptions.items).toEqual([{ _id: "s1" }]);
  });
});
