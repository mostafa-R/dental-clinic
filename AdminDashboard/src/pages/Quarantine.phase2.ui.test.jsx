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

vi.mock("../features/quarantine/quarantineSlice", () => {
  const fn = (name) => (arg) => ({ type: `quarantine/${name}`, payload: arg, meta: { arg } });
  return {
    default: (s = { checks: [], loading: false, mutatingId: null, error: null }) => s,
    clearQuarantineError: fn("clear"),
    fetchAbuseChecks: fn("fetch"),
    removeQuarantine: fn("remove"),
    setQuarantine: fn("set"),
  };
});
vi.mock("../lib/i18n", () => ({ t: (k) => k }));
vi.mock("../lib/permissions", () => ({ canUserAccess: () => true }));
vi.mock("../components/ui/Badge", () => ({ default: ({ children }) => <span>{children}</span> }));
vi.mock("../components/ui/Button", () => ({ default: ({ children, onClick, disabled, loading }) => <button onClick={onClick} disabled={disabled || loading}>{children}</button> }));
vi.mock("../components/ui/Card", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/ui/EmptyState", () => ({ default: ({ title }) => <div>{title}</div> }));
vi.mock("../components/ui/Modal", () => ({ default: ({ isOpen, children, title }) => isOpen ? <div data-testid="modal"><h3>{title}</h3>{children}</div> : null }));
vi.mock("../components/ui/Spinner", () => ({ PageLoader: () => <div>loading</div> }));

import Quarantine from "./Quarantine";

let container, root;
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); container = null; root = null; vi.clearAllMocks(); dispatchMock.mockReset(); });

async function renderPage(checks) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const store = configureStore({
    reducer: {
      quarantine: (s = { checks, loading: false, mutatingId: null, error: null }) => s,
      ui: () => ({ language: "en" }),
      auth: () => ({ user: { role: "super_admin" } }),
    },
  });
  await act(async () => { root.render(<Provider store={store}><Quarantine /></Provider>); });
  return container;
}

describe("Quarantine page UI (Phase 2.1)", () => {
  it("failed mutation preserves check state and does not close modal", async () => {
    dispatchMock.mockImplementation((action) => {
      if (action?.type === "quarantine/fetch") return { type: action.type };
      if (action?.type === "quarantine/clear") return { type: action.type };
      if (action?.type === "quarantine/set") return { unwrap: () => Promise.reject("set failed") };
      return action;
    });

    const checks = [{ tenantId: "t1", name: "Clinic A", plan: "pro", quarantined: false, warnings: [] }];
    const dom = await renderPage(checks);

    // open quarantine modal for row
    const openBtn = Array.from(dom.querySelectorAll("button")).find((b) => b.textContent.includes("quarantineTenant"));
    expect(openBtn).toBeTruthy();
    await act(async () => { openBtn.click(); });
    expect(dom.querySelector('[data-testid="modal"]')).toBeTruthy();

    // click confirm (second quarantineTenant button inside modal)
    const modalBtns = Array.from(dom.querySelectorAll('[data-testid="modal"] button')).filter((b) => b.textContent.includes("quarantineTenant"));
    const confirmBtn = modalBtns[modalBtns.length - 1];
    await act(async () => { confirmBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(dom.querySelector('[data-testid="modal"]')).toBeTruthy();
    expect(dom.textContent.includes("set failed")).toBe(true);
    // table row still shows tenant and action state unchanged (quarantined false => button not disabled by quarantined flag except mutating logic; but check data preserved)
    expect(dom.textContent.includes("Clinic A")).toBe(true);
  });
});
