/**
 * Automation engine tests (PRD §12.3 — Trigger → Condition → Action).
 *
 * Covers:
 *  1. Pure helpers: getPath, renderTemplate, evaluateCondition.
 *  2. Full Event Bus → Engine pipeline with real Mongo (run audit rows).
 *  3. Cooldown, branch scope and condition gating (skip semantics).
 *  4. REST: create rule, install templates (idempotent), dry-run test.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";

vi.mock("../socket/index.js", () => ({ emitToBranch: vi.fn() }));
vi.mock("../services/whatsapp.js", () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock("../middleware/auth.js", () => ({ protect: vi.fn() }));
vi.mock("../utils/branchScope.js", () => ({
  currentTenant: vi.fn((req) => req.user?.tenant?._id || req.user?.tenant || null),
  toObjectId: (id) => id,
  loadScopedPatient: vi.fn(),
  filterByBranch: () => ({}),
}));
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

import automationRouter from "../modules/automation/automation.routes.js";
import Automation from "../modules/automation/automation.model.js";
import AutomationRun from "../modules/automation/automationRun.model.js";
import EventLog from "../modules/automation/eventLog.model.js";
import {
  getPath,
  renderTemplate,
  evaluateCondition,
  applyRule,
  invalidateAutomationCache,
  maskContact,
} from "../services/automationEngine.js";
import { publishEvent } from "../services/eventBus.js";
import { startAutomationEngine, stopAutomationEngine } from "../services/automationEngine.js";
import { assertSafeWebhookUrl, isBlockedIp } from "../utils/webhookGuard.js";
import { emitToBranch } from "../socket/index.js";
import { sendWhatsAppMessage } from "../services/whatsapp.js";
import { protect } from "../middleware/auth.js";
import { getCachedRole } from "../utils/cache.js";

const MODEL_COLLECTIONS = [Automation, AutomationRun, EventLog];

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/automations", automationRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  vi.mocked(protect).mockImplementation((req, _res, next) => {
    if (!req.cookies?.access_token) {
      return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
    }
    req.user = {
      _id: new mongoose.Types.ObjectId().toString(),
      branch: new mongoose.Types.ObjectId().toString(),
      roleId: "r1",
      tenant: { _id: TENANT, plan: "enterprise" },
    };
    next();
  });
  return app;
}

let TENANT;
const event = (type, data = {}, branch = null) => ({
  type,
  tenant: TENANT,
  branch,
  data,
  occurredAt: new Date(),
});

describe("automationEngine helpers", () => {
  it("getPath resolves dot paths", () => {
    expect(getPath({ a: { b: { c: 1 } } }, "a.b.c")).toBe(1);
    expect(getPath({ a: 1 }, "a.missing")).toBeUndefined();
    expect(getPath(null, "a")).toBeUndefined();
  });

  it("renderTemplate fills placeholders and empties missing ones", () => {
    expect(renderTemplate("Hi {{patient.firstName}} ({{patient.phone}})", { patient: { firstName: "مرض", phone: "010" } }))
      .toBe("Hi مرض (010)");
    expect(renderTemplate("Hi {{patient.firstName}} [{{x.y}}]", { patient: {} })).toBe("Hi  []");
  });

  it("evaluateCondition supports comparators and collection ops", () => {
    const ev = event("appointment.created", { status: "scheduled", total: 100 });
    expect(evaluateCondition({ field: "status", op: "eq", value: "scheduled" }, ev)).toBe(true);
    expect(evaluateCondition({ field: "status", op: "eq", value: "confirmed" }, ev)).toBe(false);
    expect(evaluateCondition({ field: "total", op: "gte", value: 50 }, ev)).toBe(true);
    expect(evaluateCondition({ field: "tags", op: "contains", value: "family" }, { data: { tags: ["family", "kids"] } })).toBe(true);
    expect(evaluateCondition({ field: "status", op: "in", value: ["scheduled", "confirmed"] }, ev)).toBe(true);
    expect(evaluateCondition({ field: "mission", op: "exists", value: true }, ev)).toBe(false);
  });

  it("maskContact hides the middle digits", () => {
    expect(maskContact("01012345678")).toBe("01****78");
    expect(maskContact("a@b.com")).toBe("a@b.com");
    expect(maskContact("01234")).toBe("01234");
  });

  it("isBlockedIp rejects private/loopback/multicast/link-local", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.0.1")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("198.18.0.1")).toBe(true);
    expect(isBlockedIp("224.0.0.1")).toBe(true);
    expect(isBlockedIp("240.0.0.1")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("::")).toBe(true);
    expect(isBlockedIp("93.184.216.34")).toBe(false);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });

  it("assertSafeWebhookUrl rejects non-http schemes and private hosts", async () => {
    await expect(assertSafeWebhookUrl("ftp://example.com")).rejects.toThrow("absolute http(s)");
    await expect(assertSafeWebhookUrl("file:///etc/passwd")).rejects.toThrow("absolute http(s)");
    await expect(assertSafeWebhookUrl("http://127.0.0.1/secret")).rejects.toThrow("private or internal");
    await expect(assertSafeWebhookUrl("http://169.254.169.254/metadata")).rejects.toThrow("private or internal");
    await expect(assertSafeWebhookUrl("http://[::1]/")).rejects.toThrow("private or internal");
    await expect(assertSafeWebhookUrl("http://localhost/")).rejects.toThrow("private or internal");
    await expect(
      assertSafeWebhookUrl("https://hook.internal.example.com/wh", {
        resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
    ).rejects.toThrow("private or internal");
  });
});

describe("Event Bus → Automation Engine pipeline", () => {
  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_test";
    await mongoose.connect(testDbUri);
    TENANT = new mongoose.Types.ObjectId();
    startAutomationEngine();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const model of MODEL_COLLECTIONS) {
      if (colls[model.collection.name]) await colls[model.collection.name].deleteMany({});
    }
    invalidateAutomationCache();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    stopAutomationEngine();
    await mongoose.disconnect();
  });

  async function makeRule(overrides = {}, actions = [{ type: "notify_branch", config: { message: "Alert" } }]) {
    return Automation.create({
      tenant: TENANT,
      name: `Rule ${Date.now()} ${Math.random()}`,
      enabled: true,
      trigger: { type: "appointment.created" },
      actions,
      ...overrides,
    });
  }

  it("executes matching rules and persists an audit run", async () => {
    const rule = await makeRule();
    await publishEvent(event("appointment.created", { status: "scheduled" }, rule.branch));

    const run = await AutomationRun.findOne({ automation: rule._id });
    expect(run).not.toBeNull();
    expect(run.status).toBe("success");
    expect(run.triggerType).toBe("appointment.created");

    const fresh = await Automation.findById(rule._id);
    expect(fresh.runCount).toBe(1);
    expect(fresh.lastRunStatus).toBe("success");
    expect(vi.mocked(emitToBranch)).toHaveBeenCalled();
  });

  it("does not fire rules for other event types", async () => {
    const rule = await makeRule();
    await publishEvent(event("invoice.paid", {}));
    expect(await AutomationRun.findOne({ automation: rule._id })).toBeNull();
  });

  it("skips when a condition does not match (with a reason)", async () => {
    const rule = await makeRule({
      conditions: [{ field: "status", op: "eq", value: "confirmed" }],
    });
    await publishEvent(event("appointment.created", { status: "scheduled" }));

    const run = await AutomationRun.findOne({ automation: rule._id });
    expect(run).not.toBeNull();
    expect(run.status).toBe("skipped");
    expect(run.reason).toBe("condition not matched");
    expect((await Automation.findById(rule._id)).runCount).toBe(0);
  });

  it("honors branch scope (rule branch ≠ event branch → skipped)", async () => {
    const otherBranch = new mongoose.Types.ObjectId();
    await makeRule({ branch: otherBranch });
    await publishEvent(event("appointment.created", {}, new mongoose.Types.ObjectId()));

    const run = await AutomationRun.findOne({ automation: { $exists: true }, status: "skipped" });
    expect(run.reason).toBe("branch scope mismatch");
  });

  it("enforces the cooldown window", async () => {
    const rule = await makeRule({ cooldownMinutes: 60 });

    await publishEvent(event("appointment.created", {}));
    expect((await Automation.findById(rule._id)).runCount).toBe(1);

    await publishEvent(event("appointment.created", {}));
    const fresh = await Automation.findById(rule._id);
    expect(fresh.runCount).toBe(1);
    const runs = await AutomationRun.find({ automation: rule._id }).sort({ createdAt: 1 });
    expect(runs.map((r) => r.status)).toEqual(["success", "skipped"]);
    expect(runs[1].reason).toContain("cooldown");
  });

  it("renders WhatsApp template placeholders into the action", async () => {
    await makeRule(
      {
        name: `WA ${Date.now()}`,
        tenant: TENANT,
        trigger: { type: "appointment.completed" },
      },
      [
        {
          type: "send_whatsapp",
          config: { to: "{{patient.phone}}", message: "مرحباً {{patient.firstName}}" },
        },
      ],
    );
    vi.mocked(sendWhatsAppMessage).mockResolvedValue(undefined);

    await publishEvent(event("appointment.completed", { patient: { phone: "010000", firstName: "مرض" } }));
    expect(vi.mocked(sendWhatsAppMessage)).toHaveBeenCalledWith(
      TENANT,
      "010000",
      "مرحباً مرض",
    );
  });

  it("applyRule dry-run never executes side effects", async () => {
    const rule = await makeRule();
    const outcome = await applyRule(rule, event("appointment.created", {}), { dryRun: true });
    expect(outcome.status).toBe("success");
    expect(outcome.actionResults[0].output).toBe("dry-run");
    expect(vi.mocked(emitToBranch)).not.toHaveBeenCalled();
    expect(await AutomationRun.find({ automation: rule._id })).toHaveLength(0);
  });

  it("webhook action POSTs a PHI-stripped payload to the configured URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, type: 'basic', status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    await makeRule(
      { trigger: { type: "appointment.created" } },
      [{ type: "webhook", config: { url: "https://example.com/hook", headers: { "x-custom": "1" } } }],
    );

    await publishEvent(event("appointment.created", { patient: { phone: "01012345678" }, secret: "hidden" }));

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(opts.method).toBe("POST");
    expect(opts.redirect).toBe("manual");
    const body = JSON.parse(opts.body);
    expect(body.data.patient.phone).toBeUndefined();
    expect(body.data.secret).toBe("hidden");

    vi.unstubAllGlobals();
  });

  it("dry-run validates webhook URLs against SSRF targets", async () => {
    const rule = await makeRule(
      { trigger: { type: "appointment.created" } },
      [{ type: "webhook", config: { url: "http://127.0.0.1:9999/internal" } }],
    );
    const outcome = await applyRule(rule, event("appointment.created", {}), { dryRun: true });
    expect(outcome.actionResults[0].status).toBe("error");
    expect(outcome.actionResults[0].error).toMatch(/private or internal/);
  });

  it("rule cache is invalidated so newly created rules appear immediately", async () => {
    const beforeEvent = event("appointment.created", {});
    await publishEvent(beforeEvent);
    expect(await AutomationRun.findOne({ triggerType: "appointment.created" })).toBeNull();

    invalidateAutomationCache();
    await makeRule();
    await publishEvent(event("appointment.created", {}));
    expect(await AutomationRun.findOne({ triggerType: "appointment.created", status: "success" })).not.toBeNull();
  });

  it("concurrent events cannot both pass the same cooldown", async () => {
    const rule = await makeRule({ cooldownMinutes: 1440 });
    invalidateAutomationCache();

    const ev1 = event("appointment.created", { id: "a1" });
    const ev2 = event("appointment.created", { id: "a2" });

    const [r1, r2] = await Promise.all([publishEvent(ev1), publishEvent(ev2)]);

    const runs = await AutomationRun.find({ automation: rule._id }).sort({ createdAt: 1 });
    const successes = runs.filter((r) => r.status === "success");
    expect(successes).toHaveLength(1);

    const fresh = await Automation.findById(rule._id);
    expect(fresh.runCount).toBe(1);
  });
});

describe("Automation REST API", () => {
  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/dental_os_test";
    await mongoose.connect(testDbUri);
    TENANT = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    const colls = mongoose.connection.collections;
    for (const model of MODEL_COLLECTIONS) {
      if (colls[model.collection.name]) await colls[model.collection.name].deleteMany({});
    }
    invalidateAutomationCache();
    vi.clearAllMocks();
    vi.mocked(getCachedRole).mockResolvedValue({
      _id: "r1",
      tenant: null,
      isSystemAdmin: false,
      permissions: [{ module: "automations", actions: ["read", "create", "update", "delete"] }],
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it("lists supported triggers and operators", async () => {
    const res = await request(makeApp()).get("/api/automations/triggers").set("Cookie", "access_token=tok");
    expect(res.status).toBe(200);
    expect(res.body.data.triggers.map((t) => t.key)).toContain("appointment.created");
    expect(res.body.data.conditionOps).toContain("eq");
  });

  it("creates a rule", async () => {
    const res = await request(makeApp())
      .post("/api/automations")
      .set("Cookie", "access_token=tok")
      .send({
        name: "Welcome",
        trigger: { type: "patient.created" },
        conditions: [{ field: "patient.type", op: "eq", value: "new" }],
        actions: [{ type: "notify_branch", config: { message: "مرحباً" } }],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.automation.enabled).toBe(true);
  });

  it("rejects an unknown trigger (400)", async () => {
    const res = await request(makeApp())
      .post("/api/automations")
      .set("Cookie", "access_token=tok")
      .send({
        name: "Bad",
        trigger: { type: "snake.created" },
        actions: [{ type: "notify_branch", config: { message: "x" } }],
      });
    expect(res.status).toBe(400);
  });

  it("installs built-in templates idempotently, disabled by default", async () => {
    const first = await request(makeApp())
      .post("/api/automations/install-templates")
      .set("Cookie", "access_token=tok")
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.data.installed).toBeGreaterThan(0);
    expect(first.body.data.existing).toBe(0);

    const second = await request(makeApp())
      .post("/api/automations/install-templates")
      .set("Cookie", "access_token=tok")
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.data.installed).toBe(0);
    expect(second.body.data.existing).toBe(first.body.data.installed);

    const disabledCount = await Automation.countDocuments({ enabled: false, isTemplate: true });
    expect(disabledCount).toBe(first.body.data.installed);
  });

  it("dry-runs a rule via /test without side effects", async () => {
    const created = await request(makeApp())
      .post("/api/automations")
      .set("Cookie", "access_token=tok")
      .send({
        name: "Test Rule",
        trigger: { type: "invoice.paid" },
        actions: [{ type: "notify_branch", config: { message: "دفع" } }],
      });
    const id = created.body.data.automation._id;

    const res = await request(makeApp())
      .post(`/api/automations/${id}/test`)
      .set("Cookie", "access_token=tok")
      .send({ event: { data: { total: 100 } } });
    expect(res.status).toBe(200);
    expect(res.body.data.matched).toBe(true);
    expect(res.body.data.plannedActions).toHaveLength(1);
    expect(res.body.data.plannedActions[0].status).toBe("success");
    expect(vi.mocked(emitToBranch)).not.toHaveBeenCalled();
  });
});