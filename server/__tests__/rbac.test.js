import { describe, expect, it, vi } from "vitest";

vi.mock("../modules/users/role.model.js", () => {
  class MockRole {}
  MockRole.findById = vi.fn();
  return { default: MockRole };
});

vi.mock("../utils/cache.js", () => ({
  getCachedRole: vi.fn(),
  cacheRole: vi.fn(),
  invalidateRole: vi.fn(),
  getCachedPermission: vi.fn(),
  cachePermission: vi.fn(),
  invalidatePermission: vi.fn(),
}));

import { checkPermission, resolveRole } from "../middleware/checkPermission.js";
import { planIncludesModule } from "../constants/plans.js";
import Role from "../modules/users/role.model.js";
import { getCachedRole, cacheRole } from "../utils/cache.js";
import { MODULES } from "../constants/permissions.js";

describe("planIncludesModule", () => {
  it("grants all modules to platform users without a tenant", () => {
    expect(planIncludesModule(null, "inventory")).toBe(true);
    expect(planIncludesModule(undefined, "roles")).toBe(true);
  });

  it("respects the stamped planModules array", () => {
    const tenant = { plan: "starter", planModules: ["dashboard", "patients", "appointments", "billing"] };
    expect(planIncludesModule(tenant, "billing")).toBe(true);
    expect(planIncludesModule(tenant, "inventory")).toBe(false);
  });

  it("falls back to the plan map when planModules is empty", () => {
    const tenant = { plan: "professional", planModules: [] };
    expect(planIncludesModule(tenant, "accounting")).toBe(true);
    expect(planIncludesModule(tenant, "inventory")).toBe(false);
  });

  it("falls back to the starter plan for unknown plans", () => {
    const tenant = { plan: "mystery", planModules: [] };
    expect(planIncludesModule(tenant, "billing")).toBe(true);
    expect(planIncludesModule(tenant, "roles")).toBe(false);
  });
});

describe("resolveRole", () => {
  it("rejects when there is no authenticated user", async () => {
    await expect(resolveRole({})).rejects.toMatchObject({ statusCode: 401 });
  });

  it("returns empty permissions for a user with no role and no tenant", async () => {
    const result = await resolveRole({ user: { roleId: null, tenant: null } });
    expect(result.isSystemAdmin).toBe(false);
    for (const mod of MODULES) {
      expect(result.permissionMap()[mod.key]).toEqual([]);
    }
  });

  it("returns empty permissions when no Role document exists", async () => {
    vi.mocked(getCachedRole).mockResolvedValue(null);
    vi.mocked(Role.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await resolveRole({ user: { roleId: "r1", tenant: "t1" } });
    expect(result.isSystemAdmin).toBe(false);
    expect(result.permissionMap().billing).toEqual([]);
  });

  it("resolves permissions from the Role document", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "billing", actions: ["read"] }],
    });
    const result = await resolveRole({ user: { roleId: "r1", tenant: "t1" } });
    expect(result.permissionMap().billing).toEqual(["read"]);
    expect(result.permissionMap().patients).toEqual([]);
  });

  it("flags system admins from the Role document", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: true,
      permissions: [],
    });
    const result = await resolveRole({ user: { roleId: "r1", tenant: "t1" } });
    expect(result.isSystemAdmin).toBe(true);
  });

  it("ignores a cached role belonging to a different tenant", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: "t2",
      isSystemAdmin: true,
      permissions: [{ module: "billing", actions: ["delete"] }],
    });
    vi.mocked(Role.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await resolveRole({ user: { roleId: "r1", tenant: "t1" } });
    expect(result.isSystemAdmin).toBe(false);
    expect(result.permissionMap().billing).toEqual([]);
  });
});

describe("checkPermission middleware", () => {
  function makeReq(user) {
    return { user, _roleResolved: undefined };
  }
  const res = {};

  it("returns 401 when there is no authenticated user", async () => {
    const next = vi.fn();
    await checkPermission("billing", "read")(makeReq(null), res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it("blocks when the tenant plan does not include the module", async () => {
    const next = vi.fn();
    const req = makeReq({ tenant: { planModules: ["dashboard", "patients"] } });
    await checkPermission("billing", "read")(req, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(next.mock.calls[0][0].message).toContain("does not include the billing module");
  });

  it("lets a user with the required action through", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "billing", actions: ["read", "create", "update"] }],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: null });
    await checkPermission("billing", "create")(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("denies an action not granted by the role", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "billing", actions: ["read"] }],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: null });
    await checkPermission("billing", "delete")(req, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(next.mock.calls[0][0].message).toContain("You do not have permission to delete billing");
  });

  it("bypasses permission checks for system admins", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: true,
      permissions: [],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: null });
    await checkPermission("inventory", "delete")(req, res, next);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("caches the resolved role on the request for reuse", async () => {
    vi.mocked(getCachedRole).mockClear();
    vi.mocked(cacheRole).mockClear();
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "billing", actions: ["read", "create"] }],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: null });
    await checkPermission("billing", "read")(req, res, next);
    await checkPermission("billing", "create")(req, res, next);
    expect(req._roleResolved).toBeDefined();
    expect(getCachedRole).toHaveBeenCalledTimes(1);
  });
});
