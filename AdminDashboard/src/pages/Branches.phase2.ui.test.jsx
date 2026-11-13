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

const dispatchSpy = vi.fn((action) => {
  if (typeof action === "function") return action(dispatchSpy, () => ({}), undefined);
  return action;
});

vi.mock("react-redux", async () => {
  const actual = await vi.importActual("react-redux");
  return {
    ...actual,
    useDispatch: () => dispatchSpy,
  };
});

vi.mock("../features/branches/branchesSlice", () => ({
  default: (state = { items: [], loading: false, pagination: { page: 1, limit: 20, total: 0, pages: 1 }, filters: { search: "", tenant: "" }, error: null }) => state,
  clearError: () => ({ type: "branches/clearError" }),
  deleteBranch: (id) => ({ type: "branches/delete", meta: { arg: id } }),
  fetchBranches: (params) => ({ type: "branches/fetch", payload: params }),
  setPage: (p) => ({ type: "branches/setPage", payload: p }),
}));
vi.mock("../features/tenants/tenantsSlice", () => ({
  default: (state = { items: [] }) => state,
  fetchTenants: (params) => ({ type: "tenants/fetch", payload: params }),
}));
vi.mock("../features/branches/BranchFormModal", () => ({ default: () => null }));
vi.mock("../lib/format", () => ({ formatDate: () => "DATE" }));
vi.mock("../lib/exportCsv", () => ({ downloadCsv: vi.fn() }));
vi.mock("../lib/i18n", () => ({ t: (k) => k }));
vi.mock("../lib/permissions", () => ({ canUserAccess: () => true }));
vi.mock("../components/ui/Modal", () => ({
  default: ({ isOpen, children, title }) => (isOpen ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null),
}));
vi.mock("../components/ui/Card", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/ui/Badge", () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock("../components/ui/Button", () => ({
  default: ({ children, onClick, disabled, loading }) => (
    <button onClick={onClick} disabled={disabled || loading}>{children}</button>
  ),
}));
vi.mock("../components/ui/EmptyState", () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock("../components/ui/Pagination", () => ({ default: () => null }));
vi.mock("../components/ui/Spinner", () => ({ PageLoader: () => <div>loading</div> }));
vi.mock("../components/ui/icons", () => ({
  ArrowDownTrayIcon: () => null,
  BuildingOfficeIcon: () => null,
  MagnifyingGlassIcon: () => null,
  PlusIcon: () => null,
}));

import Branches from "./Branches";
let container;
let root;

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
  dispatchSpy.mockReset();
});

function textIncludes(node, text) {
  return (node.textContent || "").includes(text);
}
function findButtonByText(node, text) {
  return Array.from(node.querySelectorAll("button")).find((b) => textIncludes(b, text));
}

async function renderBranches(preloadedState) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const store = configureStore({
    reducer: {
      branches: (s = preloadedState?.branches || { items: [], loading: false, pagination: { page: 1, limit: 20, total: 0, pages: 1 }, filters: { search: "", tenant: "" }, error: null }) => s,
      tenants: (s = preloadedState?.tenants || { items: [] }) => s,
      ui: (s = { language: "en" }) => s,
      auth: (s = { user: { role: "super_admin" } }) => s,
    },
  });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <Branches />
      </Provider>,
    );
  });
  return { container, store };
}

describe("Branches page UI (Phase 2.1)", () => {
  it("delete failure keeps confirmation modal open and displays error", async () => {
    dispatchSpy.mockImplementation((action) => {
      // default: no-op, but return thunk result shape if needed
      if (typeof action === "function") return action(dispatchSpy, () => ({}), undefined);
      return action;
    });
    // deleteBranch dispatch should be unwrappable and reject
    dispatchSpy.mockImplementationOnce(() => ({ type: "branches/fetch" })) // mount fetchBranches
      .mockImplementationOnce(() => ({ type: "tenants/fetch" })) // mount fetchTenants
      .mockImplementationOnce(() => ({ type: "branches/clearError" })) // click delete open clears
      .mockImplementationOnce(() => ({ type: "branches/clearError" })) // handleDelete clears
      .mockImplementationOnce(() => ({
        type: "branches/delete/rejected",
        unwrap: () => Promise.reject("delete failed"),
      }));

    const { container } = await renderBranches({
      branches: {
        items: [{ _id: "b1", name: "Main", tenant: { name: "T1" }, address: "", phone: "", status: "active", createdAt: "x" }],
        selectedBranch: null,
        loading: false,
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        filters: { search: "", tenant: "" },
        error: null,
      },
      tenants: { items: [], loading: false, pagination: { page: 1, limit: 20, total: 0, pages: 1 }, filters: {}, selectedTenant: null, error: null },
    });

    const rowDelete = findButtonByText(container, "deleteBranch");
    expect(rowDelete).toBeTruthy();
    await act(async () => { rowDelete.click(); });

    // confirm modal delete button (second deleteBranch text in modal)
    const buttons = Array.from(container.querySelectorAll("button")).filter((b) => textIncludes(b, "deleteBranch"));
    const confirmBtn = buttons[buttons.length - 1];
    expect(confirmBtn).toBeTruthy();
    await act(async () => { confirmBtn.click(); });
    // allow microtasks
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(container.querySelector('[data-testid="modal"]')).toBeTruthy();
    expect(textIncludes(container, "delete failed")).toBe(true);
  });
});
