import { describe, expect, it, vi } from "vitest";

vi.mock("../modules/users/role.model.js", () => {
  class MockRole {}
  MockRole.findById = vi.fn();
  MockRole.findOne = vi.fn();
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

import { checkPermission, checkAnyPermission, resolveRole } from "../middleware/checkPermission.js";
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

  it("denies all modules when planModules is empty (strict, no fallback)", () => {
    const tenant = { plan: "professional", planModules: [] };
    expect(planIncludesModule(tenant, "accounting")).toBe(false);
    expect(planIncludesModule(tenant, "inventory")).toBe(false);
  });

  it("denies all modules for unknown plans without stamped modules", () => {
    const tenant = { plan: "mystery", planModules: [] };
    expect(planIncludesModule(tenant, "billing")).toBe(false);
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
    vi.mocked(Role.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
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
    vi.mocked(Role.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await resolveRole({ user: { roleId: "r1", tenant: "t1" } });
    expect(result.isSystemAdmin).toBe(false);
    expect(result.permissionMap().billing).toEqual([]);
  });

  it("uses a cached role that belongs to the caller's tenant", async () => {
    vi.mocked(Role.findOne).mockClear();
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: "t1",
      isSystemAdmin: false,
      permissions: [{ module: "appointments", actions: ["read", "update"] }],
    });
    const result = await resolveRole({ user: { roleId: "r1", tenant: { _id: "t1", plan: "professional" } } });
    expect(result.permissionMap().appointments).toEqual(["read", "update"]);
    expect(Role.findOne).not.toHaveBeenCalled();
  });

  it("rejects a DB role belonging to another tenant even when cached as missing", async () => {
    vi.mocked(Role.findOne).mockClear();
    vi.mocked(getCachedRole).mockResolvedValue(null);
    vi.mocked(Role.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await resolveRole({ user: { roleId: "r1", tenant: { _id: "t1", plan: "professional" } } });
    expect(result.isSystemAdmin).toBe(false);
    expect(result.permissionMap().billing).toEqual([]);
    expect(Role.findOne).toHaveBeenCalledWith({
      _id: "r1",
      isActive: true,
      $or: [{ tenant: "t1" }, { tenant: null }],
    });
  });

  it("ignores a cached role that has been deactivated (isActive false)", async () => {
    vi.mocked(Role.findOne).mockClear();
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: "t1",
      isActive: false,
      isSystemAdmin: true,
      permissions: [],
    });
    vi.mocked(Role.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await resolveRole({ user: { roleId: "r1", tenant: { _id: "t1", plan: "professional" } } });
    expect(result.isSystemAdmin).toBe(false);
    expect(Role.findOne).toHaveBeenCalledWith({
      _id: "r1",
      isActive: true,
      $or: [{ tenant: "t1" }, { tenant: null }],
    });
  });

  it("does not grant a deactivated role resolved from the DB", async () => {
    vi.mocked(getCachedRole).mockResolvedValue(null);
    vi.mocked(Role.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const result = await resolveRole({ user: { roleId: "r1", tenant: { _id: "t1", plan: "professional" } } });
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
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", plan: "starter", planModules: ["billing"] } });
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
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", planModules: ["billing"] } });
    await checkPermission("billing", "delete")(req, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(next.mock.calls[0][0].message).toContain("You do not have permission to delete billing");
  });

  it("denies a non-admin with missing tenant context (no plan bypass)", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "billing", actions: ["read", "create"] }],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: null });
    await checkPermission("billing", "read")(req, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(next.mock.calls[0][0].message).toContain("Clinic context is missing");
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

  it("bypasses the plan gate for system admins (e.g. clinic owner)", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: "t1",
      isSystemAdmin: true,
      permissions: [],
    });
    const next = vi.fn();
    // Tenant is on a plan that does NOT include 'roles'
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", planModules: ["dashboard"] } });
    await checkPermission("roles", "read")(req, res, next);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  describe("subscription entitlement (free plan بدون_تكلفة)", () => {
    const FREE_MODULES = [
      "dashboard",
      "patients",
      "appointments",
      "billing",
      "emr",
      "treatment_plans",
      "dental_chart",
      "users",
      "roles",
    ];
    function freeTenant() {
      return { _id: "t-free", plan: "free", planModules: FREE_MODULES };
    }
    function roleWith(...modules) {
      return {
        _id: "r1",
        tenant: null,
        isSystemAdmin: false,
        permissions: modules.map((m) => ({ module: m, actions: ["read", "create", "update", "delete"] })),
      };
    }

    it("free plan + role allows inventory => 403 (plan gate first)", async () => {
      vi.mocked(getCachedRole).mockResolvedValue(roleWith("inventory"));
      const next = vi.fn();
      await checkPermission("inventory", "read")(makeReq({ roleId: "r1", tenant: freeTenant() }), res, next);
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
      expect(next.mock.calls[0][0].message).toContain("does not include the inventory module");
    });

    it("free plan + role allows accounting => 403", async () => {
      vi.mocked(getCachedRole).mockResolvedValue(roleWith("accounting"));
      const next = vi.fn();
      await checkPermission("accounting", "read")(makeReq({ roleId: "r1", tenant: freeTenant() }), res, next);
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    });

    it("free plan + role allows patients => 200", async () => {
      vi.mocked(getCachedRole).mockResolvedValue(roleWith("patients"));
      const next = vi.fn();
      await checkPermission("patients", "read")(makeReq({ roleId: "r1", tenant: freeTenant() }), res, next);
      expect(next.mock.calls[0][0]).toBeUndefined();
    });

    it("plan with inventory + role allows inventory => 200", async () => {
      vi.mocked(getCachedRole).mockResolvedValue(roleWith("inventory"));
      const next = vi.fn();
      const tenant = { _id: "t-ent", plan: "ent", planModules: [...FREE_MODULES, "inventory"] };
      await checkPermission("inventory", "read")(makeReq({ roleId: "r1", tenant }), res, next);
      expect(next.mock.calls[0][0]).toBeUndefined();
    });

    it("empty planModules => deny all (no fallback)", async () => {
      vi.mocked(getCachedRole).mockResolvedValue(roleWith("patients"));
      const next = vi.fn();
      await checkPermission("patients", "read")(
        makeReq({ roleId: "r1", tenant: { _id: "t1", plan: "free", planModules: [] } }),
        res,
        next,
      );
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    });
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
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", planModules: ["billing"] } });
    await checkPermission("billing", "read")(req, res, next);
    await checkPermission("billing", "create")(req, res, next);
    expect(req._roleResolved).toBeDefined();
    expect(getCachedRole).toHaveBeenCalledTimes(1);
  });
});

describe("checkAnyPermission middleware", () => {
  function makeReq(user) {
    return { user, _roleResolved: undefined };
  }
  const res = {};

  it("returns 401 when there is no authenticated user", async () => {
    const next = vi.fn();
    await checkAnyPermission([["billing", "delete"], ["accounting", "update"]])(makeReq(null), res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
  });

  it("blocks when the plan excludes every candidate module", async () => {
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: { planModules: ["dashboard", "patients"] } });
    await checkAnyPermission([["billing", "delete"], ["accounting", "update"]])(req, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(next.mock.calls[0][0].message).toContain("does not include the billing module");
  });

  it("lets a user through when they hold ANY of the pairs", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: "t1",
      isSystemAdmin: false,
      permissions: [
        { module: "billing", actions: ["read"] },
        { module: "accounting", actions: ["update"] },
      ],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", planModules: ["billing", "accounting"] } });
    // 'billing delete' is NOT granted, but 'accounting update' IS → allowed.
    await checkAnyPermission([["billing", "delete"], ["accounting", "update"]])(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("denies when none of the pairs are granted", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: "t1",
      isSystemAdmin: false,
      permissions: [{ module: "accounting", actions: ["read"] }],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", planModules: ["billing", "accounting"] } });
    await checkAnyPermission([["billing", "delete"], ["accounting", "update"]])(req, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(next.mock.calls[0][0].message).toContain(
      "You do not have permission to delete billing or update accounting",
    );
  });

  it("bypasses for system admins even when the plan lacks the modules", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: "t1",
      isSystemAdmin: true,
      permissions: [],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", planModules: ["dashboard"] } });
    await checkAnyPermission([["billing", "delete"], ["accounting", "update"]])(req, res, next);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("reuses the role resolved for the request", async () => {
    vi.mocked(getCachedRole).mockClear();
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "billing", actions: ["read"] }],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: { _id: "t1", planModules: ["billing"] } });
    await checkAnyPermission([["billing", "read"], ["roles", "read"]])(req, res, next);
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(req._roleResolved).toBeDefined();
  });

  it("denies checkAnyPermission for non-admin with missing tenant", async () => {
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "billing", actions: ["read"] }],
    });
    const next = vi.fn();
    const req = makeReq({ roleId: "r1", tenant: null });
    await checkAnyPermission([["billing", "read"], ["roles", "read"]])(req, res, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    expect(next.mock.calls[0][0].message).toContain("Clinic context is missing");
  });
});
