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

vi.mock("../features/errorLogs/errorLogsSlice", () => {
  const fn = (name) => (arg) => ({ type: `errorLogs/${name}`, payload: arg, meta: { arg } });
  return {
    default: (s = { logs: [], stats: null, pagination: { page: 1, limit: 50, total: 0, pages: 1 }, loading: false, resolvingId: null, error: null }) => s,
    clearErrorLogsError: fn("clear"),
    fetchErrorLogs: fn("fetch"),
    fetchErrorLogStats: fn("stats"),
    resolveErrorLog: fn("resolve"),
  };
});
vi.mock("../features/tenants/tenantsSlice", () => ({ fetchTenants: () => ({ type: "tenants/fetch" }) }));
vi.mock("../lib/i18n", () => ({ t: (k) => k }));
vi.mock("../lib/permissions", () => ({ canUserAccess: () => true }));
vi.mock("../lib/format", () => ({ formatDateTime: () => "DATE" }));
vi.mock("../lib/exportCsv", () => ({ downloadCsv: vi.fn() }));
vi.mock("../components/ui/Badge", () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock("../components/ui/Button", () => ({ default: ({ children, onClick, loading }) => <button onClick={onClick} disabled={loading}>{children}</button> }));
vi.mock("../components/ui/Card", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/ui/EmptyState", () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock("../components/ui/Pagination", () => ({ default: () => null }));
vi.mock("../components/ui/StatCard", () => ({ default: ({ title, value }) => <div>{title}:{value}</div> }));
vi.mock("../components/ui/Spinner", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("../components/ui/icons", () => ({ ArrowDownTrayIcon: () => null, CheckIcon: () => null }));

import ErrorLogs from "./ErrorLogs";

let container, root;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); container = null; root = null; vi.clearAllMocks(); dispatchMock.mockReset(); });

async function renderPage(state) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const store = configureStore({
    reducer: {
      errorLogs: (s = state) => s,
      tenants: () => ({ items: [] }),
      ui: () => ({ language: "en" }),
      auth: () => ({ user: { role: "super_admin" } }),
    },
  });
  await act(async () => { root.render(<Provider store={store}><ErrorLogs /></Provider>); });
  return container;
}

describe("ErrorLogs page UI (Phase 2.1)", () => {
  it("failed resolve displays feedback and preserves logs list", async () => {
    dispatchMock.mockImplementation((action) => {
      if (action?.type === "errorLogs/resolve") return { unwrap: () => Promise.reject("resolve failed") };
      return action;
    });

    const state = {
      logs: [{ _id: "e1", statusCode: 500, method: "GET", url: "/x", tenant: { name: "T" }, message: "boom", resolved: false, createdAt: "now" }],
      stats: { stats: { total: 1, "4xx": 0, "5xx": 1 } },
      pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      loading: false,
      resolvingId: null,
      error: null,
    };
    const dom = await renderPage(state);

    const resolveBtn = Array.from(dom.querySelectorAll("button")).find((b) => b.textContent.includes("resolveError"));
    expect(resolveBtn).toBeTruthy();
    await act(async () => { resolveBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(dom.textContent.includes("resolve failed")).toBe(true);
    expect(dom.textContent.includes("boom")).toBe(true);
    expect(dom.textContent.includes("/x")).toBe(true);
  });
});
