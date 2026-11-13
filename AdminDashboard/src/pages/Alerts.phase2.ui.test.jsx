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

vi.mock("../features/alerts/alertsSlice", () => {
  const fn = (name) => (arg) => ({ type: `alerts/${name}`, payload: arg, meta: { arg } });
  return {
    default: (s = { alerts: [], summary: {}, pagination: {}, loading: false, managingId: null, detail: null, detailLoading: false, error: null }) => s,
    clearAlertsError: fn("clear"),
    acknowledgeAlert: fn("ack"),
    acknowledgeAllAlerts: fn("ackAll"),
    resolveAlert: fn("resolve"),
    fetchActiveAlerts: fn("fetchActive"),
    fetchAlertById: fn("fetchById"),
    fetchAlerts: fn("fetch"),
    fetchAlertSummary: fn("fetchSummary"),
  };
});
vi.mock("../features/tenants/tenantsSlice", () => ({ fetchTenants: () => ({ type: "tenants/fetch" }) }));
vi.mock("../lib/i18n", () => ({ t: (k) => k }));
vi.mock("../lib/permissions", () => ({ canUserAccess: () => true }));
vi.mock("../lib/format", () => ({ getRelativeTime: () => "now", formatDateTime: () => "DATE" }));
vi.mock("../components/ui/Badge", () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock("../components/ui/Card", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/ui/EmptyState", () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock("../components/ui/Modal", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/ui/Pagination", () => ({ default: () => null }));
vi.mock("../components/ui/StatCard", () => ({ default: () => <div /> }));
vi.mock("../components/ui/Spinner", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("../components/ui/icons", () => ({ CheckIcon: () => null }));

import Alerts from "./Alerts";

let container, root;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); container = null; root = null; vi.clearAllMocks(); dispatchMock.mockReset(); });

async function renderPage(alertsState) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const store = configureStore({
    reducer: {
      alerts: (s = alertsState) => s,
      tenants: () => ({ items: [] }),
      ui: () => ({ language: "en" }),
      auth: () => ({ user: { role: "super_admin" } }),
    },
  });
  await act(async () => { root.render(<Provider store={store}><Alerts /></Provider>); });
  return container;
}

describe("Alerts page UI (Phase 2.1)", () => {
  it("successful mutation triggers list, summary, and active-alert reconciliation", async () => {
    const calls = [];
    dispatchMock.mockImplementation((action) => {
      calls.push(action?.type);
      if (typeof action === "function") {
        // thunk creators in mocked slice return plain actions; some pages might dispatch thunks in other cases
        const r = action(dispatchMock, () => ({}));
        return r;
      }
      if (action?.type === "alerts/ack" || action?.type === "alerts/ackAll" || action?.type === "alerts/resolve") {
        return { unwrap: () => Promise.resolve({}) };
      }
      return action;
    });

    const state = {
      alerts: [{ _id: "a1", title: "Test", severity: "warning", status: "active", type: "error_rate", createdAt: "now", tenant: null }],
      summary: { open: 1, active: 1, acknowledged: 0, resolved: 0, bySeverity: { critical: 0, warning: 1, info: 0 } },
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      loading: false,
      managingId: null,
      detail: null,
      detailLoading: false,
      error: null,
      active: [],
    };
    const dom = await renderPage(state);

    const ackBtn = Array.from(dom.querySelectorAll("button")).find((b) => b.textContent.includes("alertsAcknowledge"));
    expect(ackBtn).toBeTruthy();
    await act(async () => { ackBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(calls).toContain("alerts/fetch");
    expect(calls).toContain("alerts/fetchSummary");
    expect(calls).toContain("alerts/fetchActive");
  });

  it("failed mutation preserves existing state", async () => {
    dispatchMock.mockImplementation((action) => {
      if (action?.type === "alerts/resolve") return { unwrap: () => Promise.reject("resolve failed") };
      return action;
    });

    const state = {
      alerts: [{ _id: "a1", title: "Alert Title", severity: "critical", status: "active", type: "memory", createdAt: "now" }],
      summary: { open: 1, active: 1, acknowledged: 0, resolved: 0, bySeverity: { critical: 1, warning: 0, info: 0 } },
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      loading: false,
      managingId: null,
      detail: null,
      detailLoading: false,
      error: null,
      active: [],
    };
    const dom = await renderPage(state);

    const resolveBtn = Array.from(dom.querySelectorAll("button")).find((b) => b.textContent.includes("alertsResolve"));
    await act(async () => { resolveBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(dom.textContent.includes("resolve failed")).toBe(true);
    expect(dom.textContent.includes("Alert Title")).toBe(true);
  });
});
