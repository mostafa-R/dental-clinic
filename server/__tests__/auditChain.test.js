import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  canonicalize,
  computeAuditHash,
  appendAuditLog,
  verifyAuditChain,
} from "../utils/auditChain.js";

const mocks = vi.hoisted(() => {
  const AuditLog = {
    __head: null,
    __rows: [],
    findOne() {
      return {
        sort() {
          return this;
        },
        select() {
          return this;
        },
        lean() {
          return Promise.resolve(AuditLog.__head);
        },
      };
    },
    find() {
      return {
        sort() {
          return this;
        },
        select() {
          return this;
        },
        lean() {
          return Promise.resolve(AuditLog.__rows);
        },
      };
    },
    create: vi.fn(),
    deleteOne: vi.fn(() => Promise.resolve({ deletedCount: 1 })),
  };
  return { AuditLog };
});

vi.mock("../modules/site/audit/auditLog.model.js", () => ({ default: mocks.AuditLog }));

const SECRET = "audit-chain-test-secret";
const OID = "507f1f77bcf86cd799439011";
const OTHER_OID = "507f191e810c19729de860ea";

beforeEach(() => {
  process.env.AUDIT_CHAIN_SECRET = SECRET;
  mocks.AuditLog.__head = null;
  mocks.AuditLog.__rows = [];
  mocks.AuditLog.create.mockReset();
  mocks.AuditLog.create.mockImplementation((doc) => {
    const created = { _id: OID, ...doc };
    mocks.AuditLog.__head = created;
    return Promise.resolve(created);
  });
  mocks.AuditLog.deleteOne.mockReset();
  mocks.AuditLog.deleteOne.mockResolvedValue({ deletedCount: 1 });
});

afterAll(() => {
  delete process.env.AUDIT_CHAIN_SECRET;
});

describe("canonicalize", () => {
  it("serializes primitives deterministically", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(undefined)).toBe("null");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize("hello")).toBe('"hello"');
  });

  it("serializes dates as ISO strings and buffers as hex", () => {
    const d = new Date("2024-01-02T03:04:05.000Z");
    expect(canonicalize(d)).toBe('"2024-01-02T03:04:05.000Z"');
    expect(canonicalize(Buffer.from("a1b2", "hex"))).toBe('"a1b2"');
  });

  it("serializes objects with sorted keys regardless of insertion order", () => {
    const a = canonicalize({ z: 1, a: { b: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, b: 2 }, z: 1 });
    expect(a).toBe(b);
    expect(a).toContain('"a"');
    expect(a).toContain('"z"');
  });

  it("normalizes ObjectId-likes to their hex string", () => {
    const oid = { _bsontype: "ObjectID", toString: () => OID };
    expect(canonicalize(oid)).toBe(`"${OID}"`);
  });

  it("serializes arrays element-wise", () => {
    expect(canonicalize([1, "x", null])).toBe('[1,"x",null]');
  });
});

describe("computeAuditHash", () => {
  it("is deterministic for the same payload and prevHash", () => {
    const payload = { action: "tenant.create", admin: OID, scope: "site" };
    expect(computeAuditHash(payload, "prev-1")).toBe(computeAuditHash(payload, "prev-1"));
  });

  it("changes when the prevHash changes", () => {
    const payload = { action: "tenant.create", admin: OID };
    expect(computeAuditHash(payload, "prev-1")).not.toBe(computeAuditHash(payload, "prev-2"));
  });

  it("changes when the payload changes", () => {
    expect(computeAuditHash({ action: "tenant.create" })).not.toBe(
      computeAuditHash({ action: "tenant.suspend" }),
    );
  });

  it("uses an empty prevHash by default", () => {
    expect(computeAuditHash({ action: "tenant.create" })).toBe(
      computeAuditHash({ action: "tenant.create" }, ""),
    );
  });
});

describe("appendAuditLog", () => {
  const entry = () => ({
    admin: OID,
    scope: "site",
    adminEmail: "root@clinic.example",
    adminRole: "superadmin",
    action: "tenant.create",
    target: { type: "tenant", id: OTHER_OID, name: "Acme" },
    details: { seats: 5 },
    requestId: "req-1",
    ip: "203.0.113.9",
    userAgent: "vitest/1.0",
  });

  it("creates the headless entry with an empty prevHash and a linked hash", async () => {
    const created = await appendAuditLog(entry());
    const payload = {
      action: "tenant.create",
      admin: OID,
      tenantActor: null,
      scope: "site",
      adminEmail: "root@clinic.example",
      adminRole: "superadmin",
      target: { type: "tenant", id: OTHER_OID, name: "Acme" },
      details: { seats: 5 },
      requestId: "req-1",
      ip: "203.0.113.9",
      userAgent: "vitest/1.0",
    };
    expect(mocks.AuditLog.create).toHaveBeenCalledWith({
      ...entry(),
      prevHash: "",
      hash: computeAuditHash(payload, ""),
    });
    expect(created._id).toBe(OID);
    expect(created.prevHash).toBe("");
  });

  it("links a new entry to the existing chain head", async () => {
    const headHash = computeAuditHash({ action: "branch.create" }, "");
    mocks.AuditLog.__head = { _id: "head-1", hash: headHash };
    await appendAuditLog(entry());
    const payload = {
      action: "tenant.create",
      admin: OID,
      tenantActor: null,
      scope: "site",
      adminEmail: "root@clinic.example",
      adminRole: "superadmin",
      target: { type: "tenant", id: OTHER_OID, name: "Acme" },
      details: { seats: 5 },
      requestId: "req-1",
      ip: "203.0.113.9",
      userAgent: "vitest/1.0",
    };
    expect(mocks.AuditLog.create).toHaveBeenCalledWith({
      ...entry(),
      prevHash: headHash,
      hash: computeAuditHash(payload, headHash),
    });
  });

  it("re-appends when a concurrent append forks the chain and deletes the stale entry", async () => {
    mocks.AuditLog.__head = null;
    let call = 0;
    mocks.AuditLog.create.mockImplementation((doc) => {
      const id = `mine-${++call}`;
      const created = { _id: id, ...doc };
      if (call === 1) {
        mocks.AuditLog.__head = { _id: "other-1", hash: "forked-hash" };
      } else {
        mocks.AuditLog.__head = created;
      }
      return Promise.resolve(created);
    });

    const result = await appendAuditLog(entry());

    expect(call).toBe(2);
    expect(mocks.AuditLog.deleteOne).toHaveBeenCalledWith({ _id: "mine-1" });
    expect(result._id).toBe("mine-2");
    expect(result.prevHash).toBe("forked-hash");
  });

  it("keeps the fork entry when AUDIT_CHAIN_KEEP_FORKS is set", async () => {
    process.env.AUDIT_CHAIN_KEEP_FORKS = "1";
    mocks.AuditLog.__head = null;
    let call = 0;
    mocks.AuditLog.create.mockImplementation((doc) => {
      const id = `mine-${++call}`;
      mocks.AuditLog.__head = { _id: "other-1", hash: "forked-hash" };
      return Promise.resolve({ _id: id, ...doc });
    });

    const result = await appendAuditLog(entry());

    expect(mocks.AuditLog.deleteOne).not.toHaveBeenCalled();
    expect(result._id).toBe("mine-1");
    delete process.env.AUDIT_CHAIN_KEEP_FORKS;
  });

  it("nulls falsy admin and tenantActor ids in the payload", async () => {
    mocks.AuditLog.__head = null;
    await appendAuditLog({ action: "user.role_change", scope: "tenant" });
    const createArg = mocks.AuditLog.create.mock.calls[0][0];
    expect(createArg.prevHash).toBe("");
    const payload = {
      action: "user.role_change",
      admin: null,
      tenantActor: null,
      scope: "tenant",
      adminEmail: undefined,
      adminRole: undefined,
      target: undefined,
      details: undefined,
      requestId: undefined,
      ip: undefined,
      userAgent: undefined,
    };
    expect(createArg.hash).toBe(computeAuditHash(payload, ""));
  });
});

describe("verifyAuditChain", () => {
  const payloadOf = (row) => ({
    action: row.action,
    admin: row.admin ? String(row.admin) : null,
    tenantActor: row.tenantActor ? String(row.tenantActor) : null,
    scope: row.scope,
    adminEmail: row.adminEmail,
    adminRole: row.adminRole,
    target: row.target,
    details: row.details,
    requestId: row.requestId,
    ip: row.ip,
    userAgent: row.userAgent,
  });

  function buildRows() {
    const r1 = {
      _id: "entry-1",
      action: "tenant.create",
      admin: OID,
      scope: "site",
      prevHash: "",
      hash: "",
    };
    r1.hash = computeAuditHash(payloadOf(r1), "");
    const r2 = {
      _id: "entry-2",
      action: "branch.create",
      admin: OID,
      scope: "site",
      prevHash: r1.hash,
      hash: "",
    };
    r2.hash = computeAuditHash(payloadOf(r2), r1.hash);
    return [r1, r2];
  }

  it("reports an empty chain as valid", async () => {
    const result = await verifyAuditChain();
    expect(result).toEqual({ valid: true, errors: [], checked: 0 });
  });

  it("validates an intact chain", async () => {
    mocks.AuditLog.__rows = buildRows();
    const result = await verifyAuditChain();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checked).toBe(2);
  });

  it("detects a chain break when prevHash does not link", async () => {
    const rows = buildRows();
    rows[1].prevHash = "tampered-prev";
    mocks.AuditLog.__rows = rows;
    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Chain break: entry entry-2");
  });

  it("detects tampering when the hash no longer matches", async () => {
    const rows = buildRows();
    rows[1].hash = "deadbeef";
    mocks.AuditLog.__rows = rows;
    const result = await verifyAuditChain();
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Hash mismatch: entry entry-2");
    expect(result.errors[0]).toContain("(branch.create)");
  });
});