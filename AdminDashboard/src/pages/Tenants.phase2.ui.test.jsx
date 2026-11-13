import React from "react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";

beforeAll(() => {
  globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const dispatchMock = vi.fn();
const mockPlans = [{ _id: "p1", key: "basic", name: "Basic" }, { _id: "p2", key: "pro", name: "Pro" }];

vi.mock("react-redux", async () => {
  const actual = await vi.importActual("react-redux");
  return { ...actual, useDispatch: () => dispatchMock };
});

vi.mock("../features/tenants/tenantsSlice", () => {
  const fn = (name) => (arg) => ({ type: `tenants/${name}`, payload: arg, meta: { arg } });
  return {
    default: (s = {}) => s,
    activateTenant: fn("activate"),
    archiveTenant: fn("archive"),
    deleteTenant: fn("delete"),
    fetchTenants: fn("fetch"),
    setFilters: fn("setFilters"),
    setPage: fn("setPage"),
    suspendTenant: fn("suspend"),
    updateTenant: fn("update"),
  };
});
vi.mock("../features/plans/plansSlice", () => ({ fetchPlans: () => ({ type: "plans/fetch" }) }));
vi.mock("../features/impersonation/impersonationSlice", () => ({ startImpersonation: () => ({ type: "imp/start" }) }));
vi.mock("../features/tenants/TenantFormModal", () => ({ default: () => null }));
vi.mock("../features/tenants/UsageQuotaModal", () => ({ default: () => null }));
vi.mock("../lib/axios", () => ({ default: { get: vi.fn().mockResolvedValue({ data: { users: [] } }) } }));
vi.mock("../lib/format", () => ({ formatCurrency: (v) => String(v), formatDate: () => "DATE", formatNumber: (v) => String(v) }));
vi.mock("../lib/exportCsv", () => ({ downloadCsv: vi.fn() }));
vi.mock("../lib/roles", () => ({ TENANT_STATUS: { ACTIVE: "active", TRIAL: "trial", SUSPENDED: "suspended", CANCELLED: "cancelled", ARCHIVED: "archived" } }));
vi.mock("../lib/i18n", () => ({ t: (k, maybeVars) => typeof maybeVars === "string" ? k : k }));
vi.mock("../lib/permissions", () => ({ canUserAccess: () => true }));

vi.mock("../components/ui/Modal", () => ({ default: ({ isOpen, children, title }) => isOpen ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null }));
vi.mock("../components/ui/ConfirmDialog", () => ({
  default: ({ isOpen, title, message, onConfirm, onClose, confirmLabel }) => isOpen ? (
    <div data-testid="confirm-dialog">
      <h2>{title}</h2>
      <p>{message}</p>
      <button data-testid="confirm-action" onClick={onConfirm}>{confirmLabel || "confirm"}</button>
      <button data-testid="cancel-action" onClick={onClose}>cancel</button>
    </div>
  ) : null,
}));
vi.mock("../components/ui/Card", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/ui/Badge", () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock("../components/ui/Button", () => ({ default: ({ children, onClick, disabled, loading }) => <button onClick={onClick} disabled={disabled || loading}>{children}</button> }));
vi.mock("../components/ui/EmptyState", () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock("../components/ui/Input", () => ({ default: ({ icon: _icon, ...props }) => <input {...props} /> }));
vi.mock("../components/ui/PageHeader", () => ({ default: ({ title, actions }) => <div><h1>{title}</h1><div>{actions}</div></div> }));
vi.mock("../components/ui/Pagination", () => ({ default: () => null }));
vi.mock("../components/ui/Select", () => ({ default: ({ children, ...props }) => <select {...props}>{children}</select> }));
vi.mock("../components/ui/Spinner", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("../components/ui/icons", () => ({
  ArrowDownTrayIcon: () => null, BuildingOfficeIcon: () => null, EyeIcon: () => null, MagnifyingGlassIcon: () => null, PlusIcon: () => null,
}));

import Tenants from "./Tenants";

let container, root;

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  container = null; root = null;
  vi.clearAllMocks();
  dispatchMock.mockReset();
});

function allByText(node, tag, text) {
  return Array.from(node.querySelectorAll(tag)).filter((el) => (el.textContent || "").includes(text));
}

const baseTenantsState = {
  items: [
    { _id: "t1", name: "Clinic One", email: "a@x.com", plan: "basic", status: "active", branchesCount: 1, usersCount: 2, createdAt: "x" },
    { _id: "t2", name: "Clinic Two", email: "b@x.com", plan: "basic", status: "active", branchesCount: 1, usersCount: 2, createdAt: "x" },
  ],
  loading: false,
  pagination: { page: 1, totalPages: 1 },
  filters: { search: "", status: "", plan: "", dormant: "", trialExpiring: "" },
};

async function renderTenants(overrides = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const store = configureStore({
    reducer: {
      tenants: (s = { ...baseTenantsState, ...overrides.tenants }) => s,
      plans: (s = { items: mockPlans }) => s,
      ui: (s = { language: "en" }) => s,
      auth: (s = { user: { role: "super_admin" } }) => s,
      impersonation: (s = { active: false, handoffCode: null }) => s,
    },
  });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/tenants"]}>
          <Tenants />
        </MemoryRouter>
      </Provider>,
    );
  });
  return container;
}

function baseDispatch(impl) {
  dispatchMock.mockImplementation((action) => {
    if (typeof impl === "function") return impl(action);
    return action;
  });
}

describe("Tenants page UI (Phase 2.1)", () => {
  it("single mutation failure shows error feedback and keeps confirm dialog open", async () => {
    baseDispatch((action) => {
      if (action?.type === "tenants/suspend") return { unwrap: () => Promise.reject("suspend failed") };
      return action;
    });
    const dom = await renderTenants();

    const suspendBtn = allByText(dom, "button", "suspendTenant")[0];
    expect(suspendBtn).toBeTruthy();
    await act(async () => { suspendBtn.click(); });
    expect(dom.querySelector('[data-testid="confirm-dialog"]')).toBeTruthy();

    const confirmBtn = dom.querySelector('[data-testid="confirm-action"]');
    await act(async () => { confirmBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(dom.querySelector('[data-testid="confirm-dialog"]')).toBeTruthy();
    expect(dom.textContent.includes("suspend failed")).toBe(true);
  });

  it("bulk partial failure preserves failed selections and does not reset success", async () => {
    baseDispatch((action) => {
      if (action?.type === "tenants/suspend") {
        const id = action.meta?.arg;
        if (id === "t1") return { unwrap: () => Promise.resolve({}) };
        return { unwrap: () => Promise.reject("fail") };
      }
      return action;
    });
    const dom = await renderTenants();

    const checkboxes = Array.from(dom.querySelectorAll('tbody input[type="checkbox"]'));
    expect(checkboxes.length).toBe(2);
    await act(async () => { checkboxes[0].click(); checkboxes[1].click(); });

    const bulkSuspend = allByText(dom, "button", "bulkSuspend").find((b) => !b.closest('[data-testid="confirm-dialog"]'));
    expect(bulkSuspend).toBeTruthy();
    await act(async () => { bulkSuspend.click(); });

    // bulk confirm dialog
    expect(dom.querySelector('[data-testid="confirm-dialog"]')).toBeTruthy();
    const confirmBtn = dom.querySelector('[data-testid="confirm-action"]');
    await act(async () => { confirmBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // failure feedback shown, bulk confirm closed by handler on failure path
    expect(dom.textContent.includes("bulkFailed")).toBe(true);
    expect(dom.querySelector('[data-testid="confirm-dialog"]')).toBeFalsy();

    // failed selection preserved (t2 failed) and not reset to empty
    const selectedLabel = dom.textContent.includes("selectedCount");
    expect(selectedLabel).toBe(true);
    const rowBoxes = Array.from(dom.querySelectorAll('tbody input[type="checkbox"]'));
    const checked = rowBoxes.filter((c) => c.checked).map((c) => c.getAttribute("aria-label") || "");
    expect(checked.some((a) => a.includes("Clinic Two"))).toBe(true);
    expect(rowBoxes.some((c) => c.checked)).toBe(true);
  });

  it("bulk plan modal stays open on partial failure and preserves failed selections", async () => {
    baseDispatch((action) => {
      if (action?.type === "tenants/update") {
        const id = action.meta?.arg?.id || action.payload?.id;
        if (id === "t1") return { unwrap: () => Promise.resolve({}) };
        return { unwrap: () => Promise.reject("fail") };
      }
      return action;
    });
    const dom = await renderTenants();

    const checkboxes = Array.from(dom.querySelectorAll('tbody input[type="checkbox"]'));
    await act(async () => { checkboxes[0].click(); checkboxes[1].click(); });

    const changePlanBtn = allByText(dom, "button", "changePlan").find((b) => !b.closest('[data-testid="modal"]'));
    expect(changePlanBtn).toBeTruthy();
    await act(async () => { changePlanBtn.click(); });
    expect(dom.querySelector('[data-testid="modal"]')).toBeTruthy();

    const modal = dom.querySelector('[data-testid="modal"]');
    const planSelect = modal.querySelector("select");
    await act(async () => {
      planSelect.value = "pro";
      planSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const applyBtn = allByText(modal, "button", "changePlan").slice(-1)[0];
    await act(async () => { applyBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(dom.querySelector('[data-testid="modal"]')).toBeTruthy(); // modal remains open
    expect(dom.textContent.includes("bulkFailed")).toBe(true);
    const rowBoxes = Array.from(dom.querySelectorAll('tbody input[type="checkbox"]'));
    expect(rowBoxes.some((c) => c.checked)).toBe(true); // failed selections preserved
  });
});
