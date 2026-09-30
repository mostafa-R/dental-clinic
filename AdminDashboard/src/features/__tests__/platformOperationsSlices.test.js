/**
 * Thunk/reducer tests for the platform operations surface — the security and
 * configuration actions that were implemented on the server but had no client
 * caller: audit-chain verification, alert detail, error-log resolution and
 * feature-flag bulk module updates, plus the 13 `/analytics/platform/*` reads.
 *
 * What the server tests cannot cover: that the client hits the exact endpoint,
 * unwraps `{ success, data }` correctly, isolates a 403 to its own section, and
 * never leaves a stale pending flag behind.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("../../lib/axios", () => {
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  };
  return { default: api };
});

import api from "../../lib/axios";
import auditLogsReducer, {
  clearVerification,
  verifyAuditChain,
} from "../auditLogs/auditLogsSlice";
import alertsReducer, {
  clearAlertDetail,
  fetchAlertById,
} from "../alerts/alertsSlice";
import errorLogsReducer, { resolveErrorLog } from "../errorLogs/errorLogsSlice";
import featureFlagsReducer, { setTenantModules } from "../featureFlags/featureFlagsSlice";
import platformAnalyticsReducer, {
  clearSectionError,
  fetchBackgroundJobs,
  fetchFinancialAnalytics,
  fetchPlatformOverview,
  fetchSecurityMonitoring,
  fetchSiteRoles,
  resetPlatformAnalytics,
} from "../platformAnalytics/platformAnalyticsSlice";
import impersonationReducer, { endImpersonation } from "../impersonation/impersonationSlice";

const storeFor = (reducer) => configureStore({ reducer });
const pending = (thunk) => ({ type: thunk.pending.type });
const rejected = (thunk, payload) => ({ type: thunk.rejected.type, payload });

/** A 403 as axios surfaces it, so the per-section "forbidden" branch can be tested. */
const forbidden = () => {
  const err = new Error("Request failed with status code 403");
  err.response = { status: 403, data: { message: "Insufficient site permissions" } };
  return err;
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------- audit chain verify */

describe("auditLogsSlice / verifyAuditChain", () => {
  it("GETs /audit-logs/verify and stores the verdict", async () => {
    api.get.mockResolvedValue({ data: { valid: true, errors: [], checked: 128 } });
    const store = storeFor(auditLogsReducer);

    await store.dispatch(verifyAuditChain());

    expect(api.get).toHaveBeenCalledWith("/audit-logs/verify");
    expect(store.getState().verification).toEqual({
      valid: true,
      errors: [],
      checked: 128,
    });
    expect(store.getState().verifying).toBe(false);
  });

  it("surfaces tampering errors so the UI can refuse to trust the log", async () => {
    api.get.mockResolvedValue({
      data: { valid: false, errors: ["Hash mismatch: entry abc"], checked: 128 },
    });
    const store = storeFor(auditLogsReducer);

    await store.dispatch(verifyAuditChain());

    expect(store.getState().verification.valid).toBe(false);
    expect(store.getState().verification.errors).toEqual(["Hash mismatch: entry abc"]);
  });

  it("clears the verifying flag when the request fails", async () => {
    api.get.mockRejectedValue(new Error("network down"));
    const store = storeFor(auditLogsReducer);

    await store.dispatch(verifyAuditChain());

    expect(store.getState().verifying).toBe(false);
    expect(store.getState().verification).toBeNull();
  });

  it("clears a stale verdict on demand", () => {
    const seeded = auditLogsReducer(undefined, verifyAuditChain.fulfilled({ data: {} }, "", undefined));
    expect(seeded.verification).not.toBeNull();
    expect(auditLogsReducer(seeded, clearVerification()).verification).toBeNull();
  });
});

/* ---------------------------------------------------------- alert detail */

describe("alertsSlice / fetchAlertById", () => {
  it("GETs /alerts/:id and keeps the populated detail separate from the list", async () => {
    const alert = { _id: "a1", title: "Redis down", tenant: { name: "Bright Smile" } };
    // The controller answers { alert }, which the axios interceptor unwraps to
    // that object — the thunk must pick `.alert` off the envelope.
    api.get.mockResolvedValue({ data: { alert } });
    const store = storeFor(alertsReducer);

    await store.dispatch(fetchAlertById("a1"));

    expect(api.get).toHaveBeenCalledWith("/alerts/a1");
    expect(store.getState().detail).toEqual(alert);
    // The list itself must not be touched by a detail fetch.
    expect(store.getState().alerts).toEqual([]);
  });

  it("clears detailLoading on failure so the modal can close cleanly", async () => {
    api.get.mockRejectedValue(new Error("404"));
    const store = storeFor(alertsReducer);

    await store.dispatch(fetchAlertById("missing"));

    expect(store.getState().detailLoading).toBe(false);
    expect(store.getState().detail).toBeNull();
  });

  it("clears the detail on close", async () => {
    api.get.mockResolvedValue({ data: { alert: { _id: "a1" } } });
    const store = storeFor(alertsReducer);
    await store.dispatch(fetchAlertById("a1"));

    store.dispatch(clearAlertDetail());

    expect(store.getState().detail).toBeNull();
  });
});

/* ------------------------------------------------------ error-log resolve */

describe("errorLogsSlice / resolveErrorLog", () => {
  const LOG = { _id: "e1", statusCode: 500, message: "boom", resolved: false };

  it("PATCHes /error-logs/:id/resolve", async () => {
    api.patch.mockResolvedValue({ data: { log: { ...LOG, resolved: true } } });
    const store = storeFor(errorLogsReducer);

    await store.dispatch(resolveErrorLog("e1"));

    expect(api.patch).toHaveBeenCalledWith("/error-logs/e1/resolve");
  });

  it("merges the resolved log back into the list in place", async () => {
    api.patch.mockResolvedValue({
      data: { log: { ...LOG, resolved: true, resolvedBy: "admin-1" } },
    });
    const store = storeFor(errorLogsReducer);
    store.dispatch({ type: "errorLogs/fetch/fulfilled", payload: { logs: [LOG] } });

    await store.dispatch(resolveErrorLog("e1"));

    const [row] = store.getState().logs;
    expect(row.resolved).toBe(true);
    expect(row.resolvedBy).toBe("admin-1");
    expect(store.getState().logs).toHaveLength(1);
  });

  it("tracks which row is in flight and releases it afterwards", async () => {
    let resolveCall;
    api.patch.mockReturnValue(
      new Promise((r) => {
        resolveCall = () => r({ data: { log: LOG } });
      }),
    );
    const store = storeFor(errorLogsReducer);

    const inFlight = store.dispatch(resolveErrorLog("e1"));
    expect(store.getState().resolvingId).toBe("e1");

    resolveCall();
    await inFlight;
    expect(store.getState().resolvingId).toBeNull();
  });

  it("releases resolvingId on rejection so the button re-enables", async () => {
    api.patch.mockRejectedValue(new Error("500"));
    const store = storeFor(errorLogsReducer);

    await store.dispatch(resolveErrorLog("e1"));

    expect(store.getState().resolvingId).toBeNull();
  });
});

/* ------------------------------------------------- feature-flag bulk update */

describe("featureFlagsSlice / setTenantModules", () => {
  const TENANT = "t1";
  const seed = (enabledModules) => ({
    type: "featureFlags/fetchTenantModules/fulfilled",
    payload: { plan: "pro", enabledModules, availableModules: ["a", "b", "c"] },
    meta: { arg: TENANT },
  });

  it("PUTs the whole module list to /feature-flags/:tenantId/modules", async () => {
    api.put.mockResolvedValue({ data: { tenantId: TENANT, enabledModules: ["a", "b", "c"] } });
    const store = storeFor(featureFlagsReducer);

    await store.dispatch(setTenantModules({ tenantId: TENANT, modules: ["a", "b", "c"] }));

    expect(api.put).toHaveBeenCalledWith(`/feature-flags/${TENANT}/modules`, {
      modules: ["a", "b", "c"],
    });
  });

  it("sends an empty array to disable everything", async () => {
    api.put.mockResolvedValue({ data: { tenantId: TENANT, enabledModules: [] } });
    const store = storeFor(featureFlagsReducer);

    await store.dispatch(setTenantModules({ tenantId: TENANT, modules: [] }));

    expect(api.put).toHaveBeenCalledWith(`/feature-flags/${TENANT}/modules`, { modules: [] });
  });

  it("replaces enabledModules for the right tenant only", async () => {
    api.put.mockResolvedValue({ data: { tenantId: TENANT, enabledModules: ["a"] } });
    const store = storeFor(featureFlagsReducer);
    store.dispatch(seed(["a", "b", "c"]));
    store.dispatch({
      type: "featureFlags/fetchTenantModules/fulfilled",
      payload: { plan: "pro", enabledModules: ["z"], availableModules: ["z"] },
      meta: { arg: "t2" },
    });

    await store.dispatch(setTenantModules({ tenantId: TENANT, modules: ["a"] }));

    expect(store.getState().tenants[TENANT].enabledModules).toEqual(["a"]);
    expect(store.getState().tenants.t2.enabledModules).toEqual(["z"]);
  });

  it("releases the toggling flag on rejection", async () => {
    api.put.mockRejectedValue(new Error("403"));
    const store = storeFor(featureFlagsReducer);

    await store.dispatch(setTenantModules({ tenantId: TENANT, modules: ["a"] }));

    expect(store.getState().toggling).toBe(false);
    // Falls back to the slice's own message when axios has no response body.
    expect(store.getState().error).toBe("Failed to set modules");
  });
});

/* ------------------------------------------------------ platform analytics */

describe("platformAnalyticsSlice", () => {
  it("GETs each analytics endpoint under /analytics/platform", async () => {
    api.get.mockResolvedValue({ data: {} });
    const store = storeFor(platformAnalyticsReducer);

    await store.dispatch(fetchPlatformOverview());
    await store.dispatch(fetchFinancialAnalytics());

    // These reads take no query params, so the second arg is an explicit
    // undefined rather than being omitted.
    expect(api.get.mock.calls[0]).toEqual(["/analytics/platform/overview", undefined]);
    expect(api.get.mock.calls[1]).toEqual(["/analytics/platform/financial", undefined]);
  });

  it("GETs background jobs", async () => {
    api.get.mockResolvedValue({ data: { running: 1 } });
    const store = storeFor(platformAnalyticsReducer);

    await store.dispatch(fetchBackgroundJobs());

    expect(api.get.mock.calls[0][0]).toBe("/analytics/platform/jobs");
    expect(store.getState().jobs).toEqual({ running: 1 });
  });

  it("flattens the SITE_ROLES map into a renderable array", async () => {
    api.get.mockResolvedValue({
      data: { roles: { SUPER_ADMIN: "super_admin", ADMIN: "admin", SUPPORT: "support" } },
    });
    const store = storeFor(platformAnalyticsReducer);

    await store.dispatch(fetchSiteRoles());

    expect(api.get.mock.calls[0][0]).toBe("/analytics/platform/roles");
    expect(store.getState().roles).toEqual([
      { key: "SUPER_ADMIN", value: "super_admin" },
      { key: "ADMIN", value: "admin" },
      { key: "SUPPORT", value: "support" },
    ]);
  });

  it("copes with a roles payload that is missing", async () => {
    api.get.mockResolvedValue({ data: {} });
    const store = storeFor(platformAnalyticsReducer);

    await store.dispatch(fetchSiteRoles());

    expect(store.getState().roles).toEqual([]);
  });

  it("keeps a 403 scoped to its own section instead of failing the page", async () => {
    api.get.mockRejectedValue(forbidden());
    const store = storeFor(platformAnalyticsReducer);

    // SECURITY_VIEW is super_admin-only, so this is the natural 403 probe.
    await store.dispatch(fetchSecurityMonitoring());
    api.get.mockResolvedValue({ data: { revenue: {} } });
    await store.dispatch(fetchPlatformOverview());

    expect(store.getState().error.security).toEqual({
      message: "Insufficient site permissions",
      status: 403,
    });
    // The other sections are untouched and still usable.
    expect(store.getState().error.overview).toBeNull();
    expect(store.getState().overview).toEqual({ revenue: {} });
    expect(store.getState().loading.security).toBe(false);
  });

  it("tracks loading per section", () => {
    const loading = platformAnalyticsReducer(undefined, pending(fetchFinancialAnalytics));
    expect(loading.loading.financial).toBe(true);
    expect(loading.loading.overview).toBeUndefined();
  });

  it("writes the payload into the section named by its slot", () => {
    const state = platformAnalyticsReducer(
      undefined,
      fetchFinancialAnalytics.fulfilled({ revenue: { total: 10 } }, "", undefined),
    );
    expect(state.financial).toEqual({ revenue: { total: 10 } });
  });

  it("clears a single section error without touching the others", () => {
    let state = platformAnalyticsReducer(undefined, rejected(fetchFinancialAnalytics, "boom"));
    state = platformAnalyticsReducer(state, rejected(fetchSiteRoles, "nope"));
    expect(Object.keys(state.error)).toEqual(["financial", "roles"]);

    state = platformAnalyticsReducer(state, clearSectionError("financial"));

    expect(Object.keys(state.error)).toEqual(["roles"]);
  });

  it("resets every section at once", async () => {
    api.get.mockResolvedValue({ data: { revenue: {} } });
    const store = storeFor(platformAnalyticsReducer);
    await store.dispatch(fetchFinancialAnalytics());
    expect(store.getState().financial).not.toBeNull();

    store.dispatch(resetPlatformAnalytics());

    expect(store.getState().financial).toBeNull();
  });
});

// SECURITY_VIEW is super_admin-only, so its fetch is the natural 403 probe.

/* -------------------------------------------------- impersonation teardown */

describe("impersonationSlice / endImpersonation", () => {
  // The thunk reads the token out of `state.impersonation.token`, so the store
  // has to be mounted under the same key it has in the real app.
  const storeForImpersonation = () =>
    configureStore({ reducer: { impersonation: impersonationReducer } });

  it("POSTs the active token to /impersonation/end", async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    const store = storeForImpersonation();
    store.dispatch({
      type: "impersonation/start/fulfilled",
      payload: { impersonationToken: "tok-123" },
    });

    await store.dispatch(endImpersonation());

    expect(api.post).toHaveBeenCalledWith("/impersonation/end", {
      impersonationToken: "tok-123",
    });
  });

  it("clears the session from the store once the server acknowledges", async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    const store = storeForImpersonation();
    store.dispatch({
      type: "impersonation/start/fulfilled",
      payload: { impersonationToken: "tok-123" },
    });

    await store.dispatch(endImpersonation());

    const { active, token } = store.getState().impersonation;
    expect(active).toBe(false);
    expect(token).toBeNull();
  });

  it("rejects without calling the API when no session is active", async () => {
    const store = storeForImpersonation();

    const result = await store.dispatch(endImpersonation());

    expect(api.post).not.toHaveBeenCalled();
    // rejectWithValue puts the message on `payload`; `error.message` would just
    // read "Rejected" and hide which reason the thunk gave.
    expect(result.payload).toMatch(/no active impersonation/i);
  });
});
