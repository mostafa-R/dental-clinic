import React from "react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

beforeAll(() => {
  globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const dispatchMock = vi.fn();

vi.mock("react-redux", async () => {
  const actual = await vi.importActual("react-redux");
  return { ...actual, useDispatch: () => dispatchMock };
});

vi.mock("../features/subscriptions/subscriptionsSlice", () => ({
  default: (s = { items: [], revenueStats: { totalRevenue: 0, monthlyRecurring: 0, yearlyRecurring: 0, pendingPayments: [], revenueByPlan: [] }, loading: false, error: null }) => s,
  clearError: () => ({ type: "subs/clearError" }),
  createSubscription: (payload) => ({ type: "subs/create", payload, meta: { arg: payload } }),
  fetchRevenueStats: () => ({ type: "subs/fetchRevenue" }),
  fetchSubscriptions: (params) => ({ type: "subs/fetch", payload: params }),
  updateSubscription: (payload) => ({ type: "subs/update", payload, meta: { arg: payload } }),
  processPayment: (payload) => ({ type: "subs/processPayment", payload, meta: { arg: payload } }),
}));
vi.mock("../features/plans/plansSlice", () => ({ fetchPlans: () => ({ type: "plans/fetch" }) }));
vi.mock("../features/tenants/tenantsSlice", () => ({ fetchTenants: () => ({ type: "tenants/fetch" }) }));

vi.mock("../lib/format", () => ({ formatCurrency: (v) => String(v), formatDate: () => "DATE" }));
vi.mock("../lib/i18n", () => ({ t: (k) => k }));
vi.mock("../lib/permissions", () => ({ canUserAccess: () => true }));

vi.mock("../components/ui/Modal", () => ({ default: ({ isOpen, children, title }) => isOpen ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null }));
vi.mock("../components/ui/Card", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/ui/Badge", () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock("../components/ui/Button", () => ({ default: ({ children, onClick, disabled, loading }) => <button onClick={onClick} disabled={disabled || loading}>{children}</button> }));
vi.mock("../components/ui/Spinner", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("../components/ui/StatCard", () => ({ default: ({ title, value }) => <div>{title}:{value}</div> }));
vi.mock("../components/ui/icons", () => ({ BanknoteIcon: () => null, CreditCardIcon: () => null, ExclamationTriangleIcon: () => null }));

import Billing from "./Billing";

let container, root;

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  container = null; root = null;
  vi.clearAllMocks();
  dispatchMock.mockReset();
});

function buttons(node, text) {
  return Array.from(node.querySelectorAll("button")).filter((b) => (b.textContent || "").includes(text));
}

const baseState = {
  subscriptions: {
    items: [
      { _id: "s1", tenant: { _id: "t1", name: "Tenant One" }, plan: "basic", status: "past_due", amount: 100, nextPaymentAt: "x" },
    ],
    revenueStats: { totalRevenue: 0, monthlyRecurring: 0, yearlyRecurring: 0, pendingPayments: [], revenueByPlan: [] },
    loading: false,
    error: null,
  },
  plans: { items: [{ _id: "p1", key: "basic", name: "Basic" }] },
  tenants: { items: [{ _id: "t2", name: "Unsubbed" }] },
  ui: { language: "en" },
  auth: { user: { role: "super_admin" } },
};

async function renderBilling(preloaded = baseState) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const store = configureStore({
    reducer: {
      subscriptions: (s = preloaded.subscriptions) => s,
      plans: (s = preloaded.plans) => s,
      tenants: (s = preloaded.tenants) => s,
      ui: (s = preloaded.ui) => s,
      auth: (s = preloaded.auth) => s,
    },
  });
  await act(async () => {
    root.render(<Provider store={store}><Billing /></Provider>);
  });
  return container;
}

describe("Admin Billing page UI (Phase 2.1)", () => {
  it("failed mutation keeps modal open and shows error", async () => {
    dispatchMock.mockImplementation((action) => {
      if (action?.type === "subs/processPayment") return { unwrap: () => Promise.reject("payment failed") };
      return action;
    });
    const dom = await renderBilling();

    const openBtn = buttons(dom, "processPayment")[0];
    expect(openBtn).toBeTruthy();
    await act(async () => { openBtn.click(); });
    expect(dom.querySelector('[data-testid="modal"]')).toBeTruthy();

    const modal = dom.querySelector('[data-testid="modal"]');
    const submit = buttons(modal, "processPayment").slice(-1)[0];
    await act(async () => { submit.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(dom.querySelector('[data-testid="modal"]')).toBeTruthy();
    const alert = dom.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect((alert?.textContent || "").length > 0).toBe(true);
  });

  it("successful mutation triggers expected reconciliation fetches", async () => {
    const calls = [];
    dispatchMock.mockImplementation((action) => {
      calls.push(action?.type);
      if (action?.type === "subs/update") return { unwrap: () => Promise.resolve({}) };
      return action;
    });
    const dom = await renderBilling();

    const editBtn = buttons(dom, "edit")[0];
    expect(editBtn).toBeTruthy();
    await act(async () => { editBtn.click(); });
    const modal = dom.querySelector('[data-testid="modal"]');
    const saveBtn = buttons(modal, "save").slice(-1)[0];
    await act(async () => { saveBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(calls).toContain("subs/fetch");
    expect(calls).toContain("subs/fetchRevenue");
  });
});
