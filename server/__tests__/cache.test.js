import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const calls = [];
  return {
    calls,
    mockClient: {
      status: "ready",
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      scan: vi.fn(),
      on: vi.fn(),
    },
  };
});

vi.mock("../config/redis.js", () => ({
  getRedis: () => state.mockClient,
}));

vi.mock("../modules/users/role.model.js", () => ({
  default: {
    find: () => ({
      select: () => ({
        lean: async () => [{ _id: "r1" }, { _id: "r2" }],
      }),
    }),
  },
}));

import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  cacheRole,
  getCachedRole,
  invalidateRole,
  invalidateRoleCache,
  invalidateTenantRoles,
  cacheTenant,
  getCachedTenant,
  invalidateTenant,
  invalidatePermission,
} from "../utils/cache.js";

beforeEach(() => {
  vi.clearAllMocks();
  state.mockClient.status = "ready";
  state.mockClient.get.mockResolvedValue(null);
  state.mockClient.set.mockResolvedValue("OK");
  state.mockClient.del.mockResolvedValue(1);
  state.mockClient.scan.mockResolvedValue(["0", []]);
});

describe("cacheGet", () => {
  it("returns null when Redis is not connected", async () => {
    state.mockClient.status = "not-ready";
    expect(await cacheGet("role", "123")).toBeNull();
    expect(state.mockClient.get).not.toHaveBeenCalled();
  });

  it("returns parsed JSON on hit", async () => {
    state.mockClient.get.mockResolvedValue('{"name":"admin"}');
    expect(await cacheGet("role", "123")).toEqual({ name: "admin" });
    expect(state.mockClient.get).toHaveBeenCalledWith("dental:role:123");
  });

  it("returns null on a cache miss", async () => {
    expect(await cacheGet("role", "123")).toBeNull();
  });

  it("returns null when Redis errors instead of throwing", async () => {
    state.mockClient.get.mockRejectedValue(new Error("boom"));
    expect(await cacheGet("role", "123")).toBeNull();
  });
});

describe("cacheSet", () => {
  it("writes JSON with the namespace TTL", async () => {
    state.mockClient.status = "ready";
    await cacheSet("role", "r1", { name: "admin" });
    expect(state.mockClient.set).toHaveBeenCalledWith(
      "dental:role:r1",
      '{"name":"admin"}',
      "EX",
      300,
    );
  });

  it("uses an explicit TTL when provided", async () => {
    await cacheSet("tenant", "t1", { plan: "pro" }, 15);
    expect(state.mockClient.set).toHaveBeenCalledWith(
      "dental:tenant:t1",
      '{"plan":"pro"}',
      "EX",
      15,
    );
  });

  it("silently ignores Redis failures", async () => {
    state.mockClient.set.mockRejectedValue(new Error("down"));
    await expect(cacheSet("role", "r1", {})).resolves.toBeUndefined();
  });
});

describe("cacheDel", () => {
  it("deletes the namespaced key", async () => {
    await cacheDel("role", "r1");
    expect(state.mockClient.del).toHaveBeenCalledWith("dental:role:r1");
  });

  it("ignores Redis failures", async () => {
    state.mockClient.del.mockRejectedValue(new Error("down"));
    await expect(cacheDel("role", "r1")).resolves.toBeUndefined();
  });
});

describe("cacheDelPattern", () => {
  it("scans and deletes all matching keys", async () => {
    state.mockClient.scan
      .mockResolvedValueOnce(["1", ["dental:tenant:slug:a"]])
      .mockResolvedValueOnce(["0", ["dental:tenant:slug:b"]]);
    await cacheDelPattern("tenant:slug:*");
    expect(state.mockClient.scan).toHaveBeenCalledWith(
      "0",
      "MATCH",
      "dental:tenant:slug:*",
      "COUNT",
      100,
    );
    expect(state.mockClient.del).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the pattern has no keys", async () => {
    await cacheDelPattern("tenant:slug:*");
    expect(state.mockClient.del).not.toHaveBeenCalled();
  });
});

describe("role & tenant helpers", () => {
  it("caches and reads a role", async () => {
    const role = { name: "admin" };
    state.mockClient.get.mockResolvedValue(JSON.stringify(role));
    await cacheRole("r1", role);
    expect(state.mockClient.set).toHaveBeenCalledWith(
      "dental:role:r1",
      JSON.stringify(role),
      "EX",
      300,
    );
    expect(await getCachedRole("r1")).toEqual(role);
  });

  it("invalidates a role and exposes the alias", async () => {
    await invalidateRole("r1");
    expect(state.mockClient.del).toHaveBeenCalledWith("dental:role:r1");
    await invalidateRoleCache("r2");
    expect(state.mockClient.del).toHaveBeenCalledWith("dental:role:r2");
  });

  it("invalidates all roles belonging to a tenant", async () => {
    await invalidateTenantRoles("t1");
    expect(state.mockClient.del).toHaveBeenCalledWith("dental:role:r1");
    expect(state.mockClient.del).toHaveBeenCalledWith("dental:role:r2");
  });

  it("caches and reads a tenant config", async () => {
    const tenant = { plan: "pro" };
    await cacheTenant("t1", tenant);
    expect(state.mockClient.set).toHaveBeenCalledWith(
      "dental:tenant:t1",
      JSON.stringify(tenant),
      "EX",
      120,
    );
    state.mockClient.get.mockResolvedValue(JSON.stringify(tenant));
    expect(await getCachedTenant("t1")).toEqual(tenant);
  });

  it("invalidates a tenant and its slug entries", async () => {
    await invalidateTenant("t1");
    expect(state.mockClient.del).toHaveBeenCalledWith("dental:tenant:t1");
    expect(state.mockClient.scan).toHaveBeenCalledWith(
      "0",
      "MATCH",
      "dental:tenant:slug:*",
      "COUNT",
      100,
    );
  });
});

describe("permission helper", () => {
  it("invalidates the user:role key", async () => {
    await invalidatePermission("u1", "r1");
    expect(state.mockClient.del).toHaveBeenCalledWith("dental:permission:u1:r1");
  });
});