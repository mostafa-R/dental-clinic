/**
 * Thunk/reducer tests for the platform console's commercial surface — the three
 * slices behind Tenants / Plans / Subscriptions.
 *
 * These are Redux Toolkit tests with the axios instance mocked. They cover what
 * the server tests cannot: the exact endpoint each action hits, the
 * `{ success, data }` unwrapping, the loading/error flags, and — most
 * importantly — that tenant credentials and the per-tenant encryption key
 * never reach the store.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore, unwrapResult } from "@reduxjs/toolkit";

vi.mock("../../lib/axios", () => {
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return { default: api };
});

import api from "../../lib/axios";
import tenantsReducer, {
  activateTenant,
  archiveTenant,
  clearError,
  clearSelectedTenant,
  createTenant,
  deleteTenant,
  fetchTenants,
  setFilters,
  setPage,
  suspendTenant,
  updateTenant,
} from "../tenants/tenantsSlice";
import plansReducer, {
  clearSelectedPlan,
  createPlan,
  deletePlan,
  fetchPlanModules,
  fetchPlans,
  updatePlan,
} from "../plans/plansSlice";
import subscriptionsReducer, {
  clearError as clearSubError,
  createSubscription,
  fetchRevenueStats,
  fetchSubscriptions,
  processPayment,
  updateSubscription,
} from "../subscriptions/subscriptionsSlice";

/* ------------------------------------------------------------------ helpers */

const TENANT = {
  _id: "t1",
  name: "Bright Smile",
  email: "owner@bright.test",
  plan: "pro",
  status: "active",
  planModules: ["dashboard", "patients"],
  settings: { maxBranches: 2, maxDoctors: 5, maxPatients: 500, storageLimit: 5120 },
};

const PLAN = {
  _id: "p1",
  key: "pro",
  name: "Pro",
  price: 99,
  interval: "month",
  modules: ["dashboard", "patients"],
  limits: { maxBranches: 2, maxDoctors: 5, maxPatients: 500, storage: "5GB" },
  isActive: true,
};

const SUBSCRIPTION = {
  _id: "s1",
  tenant: "t1",
  plan: "pro",
  status: "active",
  billingCycle: "monthly",
  amount: 99,
};

const storeFor = (reducer) => configureStore({ reducer });

/** Build the action a thunk dispatches, for direct reducer assertions. */
const fulfilled = (thunk, payload) => ({ type: thunk.fulfilled.type, payload });
const rejected = (thunk, payload) => ({ type: thunk.rejected.type, payload });
const pending = (thunk) => ({ type: thunk.pending.type });

const initialTenants = tenantsReducer(undefined, { type: "@@INIT" });
const initialPlans = plansReducer(undefined, { type: "@@INIT" });
const initialSubs = subscriptionsReducer(undefined, { type: "@@INIT" });

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ tenants */

describe("tenantsSlice", () => {
  it("GETs /tenants with the query params it was handed", async () => {
    api.get.mockResolvedValue({
      data: { tenants: [TENANT], pagination: { total: 1 } },
    });
    const store = storeFor(tenantsReducer);

    await store.dispatch(fetchTenants({ status: "active", search: "bright" }));

    expect(api.get).toHaveBeenCalledWith("/tenants", {
      params: { status: "active", search: "bright" },
    });
    expect(store.getState().items).toEqual([TENANT]);
    expect(store.getState().pagination).toMatchObject({ total: 1 });
  });

  it("tolerates a response with no tenants array", () => {
    const state = tenantsReducer(initialTenants, fulfilled(fetchTenants, {}));
    expect(state.items).toEqual([]);
  });

  it("sets loading on pending and stores the server message on rejection", () => {
    const loading = tenantsReducer(initialTenants, pending(fetchTenants));
    expect(loading.loading).toBe(true);
    expect(loading.error).toBeNull();

    const failed = tenantsReducer(loading, rejected(fetchTenants, "Tenant not found"));
    expect(failed.loading).toBe(false);
    expect(failed.error).toBe("Tenant not found");
  });

  it("surfaces the server error message from a failed fetch", async () => {
    api.get.mockRejectedValue({
      response: { data: { message: "Plan is required" } },
    });
    const store = storeFor(tenantsReducer);

    await store.dispatch(fetchTenants({}));

    expect(store.getState().error).toBe("Plan is required");
  });

  it("falls back to a generic message when the server sends none", async () => {
    api.get.mockRejectedValue({});
    const store = storeFor(tenantsReducer);

    await store.dispatch(fetchTenants({}));

    expect(store.getState().error).toBe("Failed to fetch tenants");
  });

  it("POSTs a new tenant and prepends it to the list", async () => {
    api.post.mockResolvedValue({ data: TENANT });
    const store = storeFor(tenantsReducer);

    await store.dispatch(
      createTenant({ name: "Bright Smile", email: "owner@bright.test", plan: "pro" }),
    );

    expect(api.post).toHaveBeenCalledWith("/tenants", {
      name: "Bright Smile",
      email: "owner@bright.test",
      plan: "pro",
    });
    expect(store.getState().items[0]).toEqual(TENANT);
  });

  it("keeps admin credentials and the encryption key out of the store", () => {
    const state = tenantsReducer(
      initialTenants,
      fulfilled(createTenant, {
        ...TENANT,
        adminCredentials: { email: "owner@bright.test", password: "sup3rs3cret" },
        encryptionKey: "deadbeef".repeat(8),
      }),
    );

    expect(state.items[0]).toEqual(TENANT);
    expect(state.items[0].adminCredentials).toBeUndefined();
    expect(state.items[0].encryptionKey).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain("sup3rs3cret");
  });

  it("PUTs to the right lifecycle endpoint for each tenant action", async () => {
    api.put.mockResolvedValue({ data: TENANT });
    const store = storeFor(tenantsReducer);

    await store.dispatch(suspendTenant("t1"));
    expect(api.put).toHaveBeenCalledWith("/tenants/t1/suspend");

    await store.dispatch(activateTenant("t1"));
    expect(api.put).toHaveBeenCalledWith("/tenants/t1/activate");

    await store.dispatch(archiveTenant("t1"));
    expect(api.put).toHaveBeenCalledWith("/tenants/t1/archive");
  });

  it("replaces the matching row on update and also refreshes selectedTenant", () => {
    const seeded = { ...initialTenants, items: [TENANT], selectedTenant: TENANT };
    const updated = { ...TENANT, status: "suspended" };

    const state = tenantsReducer(seeded, fulfilled(updateTenant, updated));

    expect(state.items[0]).toEqual(updated);
    expect(state.selectedTenant).toEqual(updated);
  });

  it("does not crash when an update targets a tenant that is not in the list", () => {
    const state = tenantsReducer(
      { ...initialTenants, items: [TENANT] },
      fulfilled(updateTenant, { _id: "missing", status: "suspended" }),
    );
    expect(state.items).toEqual([TENANT]);
  });

  it("DELETEs by id and drops the row, keeping the others", async () => {
    api.delete.mockResolvedValue({ data: { message: "deleted" } });
    const store = storeFor(tenantsReducer);
    store.dispatch(fulfilled(createTenant, TENANT));
    store.dispatch(fulfilled(createTenant, { _id: "t2" }));

    await store.dispatch(deleteTenant("t1"));

    expect(api.delete).toHaveBeenCalledWith("/tenants/t1");
    expect(store.getState().items).toEqual([{ _id: "t2" }]);
  });

  it("merges filters without dropping the unset ones", () => {
    let state = tenantsReducer(initialTenants, setFilters({ status: "trial" }));
    expect(state.filters).toMatchObject({ status: "trial", plan: "" });

    state = tenantsReducer(state, setFilters({ search: "bright" }));
    expect(state.filters).toMatchObject({ status: "trial", search: "bright" });
  });

  it("resets the page on setPage and clears selection/error on demand", () => {
    const seeded = { ...initialTenants, selectedTenant: TENANT, error: "boom" };

    const paged = tenantsReducer(seeded, setPage(3));
    expect(paged.pagination.page).toBe(3);

    const cleared = tenantsReducer(paged, clearSelectedTenant());
    expect(cleared.selectedTenant).toBeNull();

    const noError = tenantsReducer(cleared, clearError());
    expect(noError.error).toBeNull();
  });
});

/* -------------------------------------------------------------------- plans */

describe("plansSlice", () => {
  it("GETs /plans", async () => {
    api.get.mockResolvedValue({ data: [PLAN] });
    const store = storeFor(plansReducer);

    await store.dispatch(fetchPlans());

    expect(api.get).toHaveBeenCalledWith("/plans");
    expect(store.getState().items).toEqual([PLAN]);
  });

  it("falls back to an empty list when the payload is not an array", () => {
    const state = plansReducer(initialPlans, fulfilled(fetchPlans, { oops: true }));
    expect(state.items).toEqual([]);
  });

  it("GETs the module catalog from /plans/modules", async () => {
    const modules = [
      { key: "dashboard", label: "Dashboard" },
      { key: "patients", label: "Patients" },
    ];
    api.get.mockResolvedValue({ data: { modules } });
    const store = storeFor(plansReducer);

    await store.dispatch(fetchPlanModules());

    expect(api.get).toHaveBeenCalledWith("/plans/modules");
    expect(store.getState().availableModules).toEqual(modules);
    expect(store.getState().items).toEqual([]);
  });

  it("tracks a separate loading/error pair for the module catalog", () => {
    let state = plansReducer(initialPlans, pending(fetchPlanModules));
    expect(state.modulesLoading).toBe(true);
    expect(state.modulesError).toBeNull();

    state = plansReducer(state, rejected(fetchPlanModules, "boom"));
    expect(state.modulesLoading).toBe(false);
    expect(state.modulesError).toBe("boom");
    // ...without disturbing the plan list's own state.
    expect(state.error).toBeNull();
  });

  it("appends a created plan to the list", async () => {
    api.post.mockResolvedValue({ data: PLAN });
    const store = storeFor(plansReducer);

    await store.dispatch(createPlan({ name: "Pro", price: 99 }));

    expect(api.post).toHaveBeenCalledWith("/plans", { name: "Pro", price: 99 });
    expect(store.getState().items).toEqual([PLAN]);
  });

  it("PUTs a partial plan update and patches the matching row", async () => {
    api.put.mockResolvedValue({ data: { ...PLAN, price: 149 } });
    const store = storeFor(plansReducer);

    await store.dispatch(createPlan(PLAN));
    await store.dispatch(updatePlan({ id: "p1", data: { price: 149 } }));

    expect(api.put).toHaveBeenCalledWith("/plans/p1", { price: 149 });
    expect(store.getState().items[0].price).toBe(149);
  });

  it("DELETEs by id and drops the row", async () => {
    api.delete.mockResolvedValue({ data: { message: "Plan deleted" } });
    const store = storeFor(plansReducer);

    await store.dispatch(createPlan(PLAN));
    await store.dispatch(deletePlan("p1"));

    expect(api.delete).toHaveBeenCalledWith("/plans/p1");
    expect(store.getState().items).toEqual([]);
  });

  it("surfaces the conflict message when a plan is still assigned to tenants", async () => {
    api.delete.mockRejectedValue({
      response: {
        data: { message: "2 tenant(s) are still assigned to this plan. Reassign them first." },
      },
    });
    const store = storeFor(plansReducer);

    await store.dispatch(deletePlan("p1"));

    expect(store.getState().error).toBe(
      "2 tenant(s) are still assigned to this plan. Reassign them first.",
    );
  });

  it("clears the selected plan", () => {
    const seeded = { ...initialPlans, selectedPlan: PLAN, error: "boom" };
    const noSelection = plansReducer(seeded, clearSelectedPlan());
    expect(noSelection.selectedPlan).toBeNull();
    // The shared clearError action type must stay namespaced per slice.
    expect(clearError.type).toBe("tenants/clearError");
  });
});

/* ------------------------------------------------------------ subscriptions */

describe("subscriptionsSlice", () => {
  it("GETs /subscriptions with params", async () => {
    api.get.mockResolvedValue({ data: [SUBSCRIPTION] });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(fetchSubscriptions({ status: "active" }));

    expect(api.get).toHaveBeenCalledWith("/subscriptions", {
      params: { status: "active" },
    });
    expect(store.getState().items).toEqual([SUBSCRIPTION]);
  });

  it("GETs /subscriptions/revenue and stores the full stats block", async () => {
    const revenue = {
      totalRevenue: 15000,
      monthlyRecurring: 3000,
      yearlyRecurring: 12000,
      pendingPayments: [{ _id: "sub1", tenantName: "Bright", amount: 99 }],
      revenueByPlan: [{ plan: "pro", revenue: 9000, count: 2 }],
      revenueByMonth: [{ month: "2026-03", total: 500 }],
    };
    api.get.mockResolvedValue({ data: revenue });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(fetchRevenueStats());

    expect(api.get).toHaveBeenCalledWith("/subscriptions/revenue");
    expect(store.getState().revenueStats).toEqual(revenue);
  });

  it("keeps a usable zeroed stats block before any revenue call", () => {
    expect(initialSubs.revenueStats).toMatchObject({
      totalRevenue: 0,
      monthlyRecurring: 0,
      yearlyRecurring: 0,
      pendingPayments: [],
      revenueByMonth: [],
      revenueByPlan: [],
    });
  });

  it("PUTs a subscription update to /subscriptions/:id", async () => {
    api.get.mockResolvedValue({ data: [SUBSCRIPTION] });
    api.put.mockResolvedValue({ data: { ...SUBSCRIPTION, amount: 1188 } });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(fetchSubscriptions({}));
    await store.dispatch(
      updateSubscription({ id: "s1", data: { plan: "pro", billingCycle: "yearly" } }),
    );

    expect(api.put).toHaveBeenCalledWith("/subscriptions/s1", {
      plan: "pro",
      billingCycle: "yearly",
    });
    expect(store.getState().items[0].amount).toBe(1188);
  });

  it("POSTs a payment to /subscriptions/:tenantId/payment and patches the row", async () => {
    const activated = { ...SUBSCRIPTION, status: "active", nextPaymentAt: "2026-04-01" };
    api.get.mockResolvedValue({ data: [SUBSCRIPTION] });
    api.post.mockResolvedValue({ data: { subscription: activated } });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(fetchSubscriptions({}));
    await store.dispatch(processPayment({ tenantId: "t1", data: { amount: 99 } }));

    expect(api.post).toHaveBeenCalledWith("/subscriptions/t1/payment", { amount: 99 });
    expect(store.getState().items[0].status).toBe("active");
  });

  it("does not throw when a payment response has no subscription field", () => {
    const state = subscriptionsReducer(
      { ...initialSubs, items: [SUBSCRIPTION] },
      fulfilled(processPayment, { message: "ok" }),
    );
    expect(state.items).toEqual([SUBSCRIPTION]);
  });

  it("surfaces the amount-mismatch rejection from the payment endpoint", async () => {
    api.post.mockRejectedValue({
      response: {
        data: { message: "Payment amount 10 does not match subscription amount 99" },
      },
    });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(processPayment({ tenantId: "t1", data: { amount: 10 } }));

    expect(store.getState().error).toBe(
      "Payment amount 10 does not match subscription amount 99",
    );
  });

  it("clears the error", () => {
    const noError = subscriptionsReducer(
      { ...initialSubs, error: "boom" },
      clearSubError(),
    );
    expect(noError.error).toBeNull();
  });

  it("surfaces a rejected plan change instead of swallowing it", async () => {
    // Regression: Billing.jsx dispatched this and closed the modal as if it had
    // worked, because the slice had no .rejected case to read.
    api.put.mockRejectedValue({
      response: { data: { message: "Plan \"Pro\" is inactive" } },
    });
    const store = storeFor(subscriptionsReducer);

    const result = await store.dispatch(
      updateSubscription({ id: "s1", data: { plan: "pro" } }),
    );

    expect(result.type).toBe(updateSubscription.rejected.type);
    expect(store.getState().error).toBe('Plan "Pro" is inactive');
  });

  it("hands unwrapResult a throwable string, which is what Billing.jsx shows", async () => {
    api.put.mockRejectedValue({ response: { data: { message: "2FA required" } } });
    const store = storeFor(subscriptionsReducer);

    const dispatched = store.dispatch(
      updateSubscription({ id: "s1", data: { plan: "pro" } }),
    );

    // Billing.jsx does `dispatch(thunk).then(unwrapResult)`; with
    // rejectWithValue the rejection value IS the server message, not a wrapper.
    await expect(dispatched.then(unwrapResult)).rejects.toBe("2FA required");
  });
});

describe("subscriptionsSlice — createSubscription", () => {
  it("POSTs to /subscriptions/:tenantId and prepends the new row", async () => {
    api.post.mockResolvedValue({ data: SUBSCRIPTION });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(
      createSubscription({
        tenantId: "t1",
        data: { plan: "pro", billingCycle: "monthly", status: "pending" },
      }),
    );

    expect(api.post).toHaveBeenCalledWith("/subscriptions/t1", {
      plan: "pro",
      billingCycle: "monthly",
      status: "pending",
    });
    expect(store.getState().items[0]).toEqual(SUBSCRIPTION);
  });

  it("surfaces the 409 when the clinic already has a subscription", async () => {
    api.post.mockRejectedValue({
      response: {
        data: {
          message:
            "This clinic already has a subscription. Edit the existing one to change its plan.",
        },
      },
    });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(
      createSubscription({ tenantId: "t1", data: { plan: "pro" } }),
    );

    expect(store.getState().error).toMatch(/already has a subscription/);
  });

  it("surfaces a rejected plan so the clinic is never left half-subscribed", async () => {
    api.post.mockRejectedValue({
      response: { data: { message: 'Plan "ghost" not found' } },
    });
    const store = storeFor(subscriptionsReducer);

    await store.dispatch(
      createSubscription({ tenantId: "t1", data: { plan: "ghost" } }),
    );

    expect(store.getState().error).toBe('Plan "ghost" not found');
    expect(store.getState().items).toEqual([]);
  });

  it("clears a previous error on the next successful create", async () => {
    const store = storeFor(subscriptionsReducer);
    store.dispatch({ type: "subscriptions/fetchSubscriptions/rejected", payload: "old" });
    expect(store.getState().error).toBe("old");

    api.post.mockResolvedValue({ data: SUBSCRIPTION });
    await store.dispatch(
      createSubscription({ tenantId: "t1", data: { plan: "pro" } }),
    );

    expect(store.getState().items).toHaveLength(1);
  });
});
