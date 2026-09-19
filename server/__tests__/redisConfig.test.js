import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const instances = [];
  class MockRedis {
    constructor(url, opts) {
      this.url = url;
      this.opts = opts;
      this.listeners = {};
      this.connected = false;
      instances.push(this);
    }
    on(ev, cb) {
      this.listeners[ev] = cb;
    }
    async connect() {
      this.connected = true;
    }
    async quit() {
      this.connected = false;
    }
    async info() {
      return "used_memory_human:1.5M\r\ntotal_connections_received:42\r\nuptime_in_seconds:3600";
    }
    multi() {
      const self = this;
      return {
        incr() { return this; },
        expire() { return this; },
        async exec() { return []; },
        ...self,
      };
    }
    async scan() {
      return ["0", []];
    }
    async get() {
      return null;
    }
  }
  return { instances, MockRedis };
});

vi.mock("ioredis", () => ({ default: state.MockRedis }));

describe("config/redis", () => {
  let redisMod;

  beforeEach(async () => {
    // Reset module state between tests so the connection singleton is fresh.
    vi.resetModules();
    redisMod = await import("../config/redis.js");
    state.instances.length = 0;
  });

  afterEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.REDIS_URL;
    state.instances.length = 0;
    vi.restoreAllMocks();
  });

  it("getRedis returns a lazily-created client with a retry strategy", () => {
    const client = redisMod.getRedis();
    expect(client).toBeInstanceOf(state.MockRedis);
    expect(state.instances.length).toBe(1);
    expect(client.opts.lazyConnect).toBe(true);
    expect(client.opts.maxRetriesPerRequest).toBe(3);
    expect(typeof client.opts.retryStrategy).toBe("function");
  });

  it("returns the same singleton client on repeated calls", () => {
    const a = redisMod.getRedis();
    const b = redisMod.getRedis();
    expect(a).toBe(b);
    expect(state.instances.length).toBe(1);
  });

  it("isRedisConnected reflects connection state", () => {
    expect(redisMod.isRedisConnected()).toBe(false);
  });

  it("getRedisInfo reports disconnected when not connected", async () => {
    const info = await redisMod.getRedisInfo();
    expect(info).toMatchObject({ connected: false, hitRate: 0 });
  });

  it("connectRedis resolves and marks connected", async () => {
    const client = redisMod.getRedis();
    await redisMod.connectRedis();
    expect(client.connected).toBe(true);
    expect(redisMod.isRedisConnected()).toBe(true);
  });

  it("connectRedis logs a warning (non-prod) when connect fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = redisMod.getRedis();
    client.connect = async () => { throw new Error("refused"); };
    process.env.NODE_ENV = "development";
    await redisMod.connectRedis();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("connectRedis rethrows in production when connect fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.NODE_ENV = "production";
    const client = redisMod.getRedis();
    client.connect = async () => { throw new Error("refused"); };
    await expect(redisMod.connectRedis()).rejects.toThrow("refused");
    err.mockRestore();
  });

  it("getRedisInfo parses INFO output when connected", async () => {
    await redisMod.connectRedis();
    const info = await redisMod.getRedisInfo();
    expect(info.connected).toBe(true);
    expect(info.usedMemory).toBe("1.5M");
    expect(info.totalConnections).toBe(42);
    expect(info.uptime).toBe(3600);
  });

  it("incrementTenantCounter writes telemetry via MULTI", async () => {
    await redisMod.connectRedis();
    const client = redisMod.getRedis();
    const execSpy = vi.fn(async () => []);
    client.multi = () => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: execSpy,
    });
    await redisMod.incrementTenantCounter("t1", "login");
    expect(execSpy).toHaveBeenCalled();
  });

  it("getAggregatedTelemetry aggregates per-tenant counters", async () => {
    await redisMod.connectRedis();
    const client = redisMod.getRedis();
    const values = new Map([
      ["telemetry:login:t1", "5"],
      ["telemetry:login:t2", "3"],
      ["telemetry:send:t1", "1"],
    ]);
    client.scan = async () => ["0", [...values.keys()]];
    client.get = async (k) => values.get(k) || null;
    const agg = await redisMod.getAggregatedTelemetry();
    expect(agg.login).toEqual({ total: 8, tenantCount: 2, perTenant: { t1: 5, t2: 3 } });
    expect(agg.send).toEqual({ total: 1, tenantCount: 1, perTenant: { t1: 1 } });
  });

  it("disconnectRedis quits the client and clears the singleton", async () => {
    await redisMod.connectRedis();
    const client = redisMod.getRedis();
    const quitSpy = vi.spyOn(client, "quit").mockResolvedValue();
    await redisMod.disconnectRedis();
    expect(quitSpy).toHaveBeenCalled();
    expect(redisMod.isRedisConnected()).toBe(false);
  });

  it("getAggregatedTelemetry returns empty when not connected", async () => {
    expect(await redisMod.getAggregatedTelemetry()).toEqual({});
  });
});