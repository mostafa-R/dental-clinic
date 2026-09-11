import { beforeEach, describe, expect, it, vi } from "vitest";

const wa = vi.hoisted(() => {
  const clientEvents = {};
  const localAuthOpts = [];
  const instances = [];
  const destroyedLog = [];
  class MockClient {
    constructor() {
      this.info = { wid: { user: "20123456789" } };
    }
    on(ev, cb) {
      clientEvents[ev] = cb;
    }
    async initialize() {
      instances.push(this);
    }
    async destroy() {
      this.destroyed = true;
      destroyedLog.push(this);
    }
    async sendMessage(chatId, msg) {
      this.sent = { chatId, msg };
    }
  }
  class MockLocalAuth {
    constructor(opts) {
      localAuthOpts.push(opts);
    }
  }
  return { clientEvents, localAuthOpts, instances, destroyedLog, MockClient, MockLocalAuth };
});

vi.mock("whatsapp-web.js", () => ({
  Client: wa.MockClient,
  LocalAuth: wa.MockLocalAuth,
}));

const modelState = {
  doc: null,
};

vi.mock("../modules/whatsapp/whatsappSetting.model.js", () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

import fs from "fs";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  sendWhatsAppMessage,
  updateWhatsAppSettings,
  normalizeE164,
} from "../services/whatsapp.js";
import WhatsAppSetting from "../modules/whatsapp/whatsappSetting.model.js";

function makeDoc(overrides = {}) {
  const doc = {
    _id: "doc1",
    tenant: "t1",
    enabled: false,
    provider: "whatsapp_web",
    status: "disconnected",
    lastError: "",
    qrCode: "",
    config: { phoneNumber: "", phoneNumberId: "", accessToken: "" },
    settings: {
      appointmentReminder: false,
      appointmentConfirm: false,
      reminderHours: 2,
      reminderHoursSecondary: 24,
      installmentReminder: false,
      noShowReminder: false,
    },
    save: vi.fn(),
    ...overrides,
  };
  doc.config = { ...doc.config, ...(overrides.config || {}) };
  doc.settings = { ...doc.settings, ...(overrides.settings || {}) };
  doc.save.mockResolvedValue(doc);
  // Hybrid: usable as a mongoose document (update path, save()) AND as the
  // query chain (findOne().select(...).lean()) the service relies on.
  doc.select = vi.fn(() => doc);
  doc.lean = vi.fn(() => doc);
  return doc;
}

function setDoc(overrides) {
  modelState.doc = makeDoc(overrides);
  return modelState.doc;
}

function fetchOk() {
  return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
}

beforeEach(async () => {
  vi.clearAllMocks();
  wa.clientEvents = {};
  wa.localAuthOpts.length = 0;
  wa.instances.length = 0;
  wa.destroyedLog.length = 0;
  modelState.doc = null;
  process.env.CHROME_PATH = "C:\\fake\\chrome.exe";
  vi.spyOn(fs, "existsSync").mockImplementation(
    (p) => p === process.env.CHROME_PATH,
  );
  WhatsAppSetting.findOne.mockImplementation(
    () => modelState.doc || (modelState.doc = makeDoc({})),
  );
  WhatsAppSetting.findOneAndUpdate.mockResolvedValue({});
  WhatsAppSetting.findByIdAndUpdate.mockResolvedValue({});
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fetchOk()));
  await disconnectWhatsApp("t1");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CHROME_PATH;
  delete process.env.WHATSAPP_MAX_CONNECTED;
  delete process.env.WHATSAPP_DEFAULT_COUNTRY;
});

describe("normalizeE164", () => {
  it("prepends the default country code to local numbers", () => {
    expect(normalizeE164("01012345678")).toBe("201012345678");
  });

  it("keeps international numbers that already carry the country prefix", () => {
    expect(normalizeE164("20123456789")).toBe("20123456789");
  });

  it("strips formatting characters", () => {
    expect(normalizeE164("+20 10 1234 5678")).toBe("201012345678");
  });

  it("leaves long international numbers untouched", () => {
    expect(normalizeE164("+15551234567")).toBe("15551234567");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeE164("")).toBe("");
    expect(normalizeE164(null)).toBe("");
  });
});

describe("connectWhatsApp (whatsapp_web)", () => {
  it("uses a per-tenant LocalAuth clientId so sessions persist", async () => {
    const result = await connectWhatsApp("t1");

    expect(result).toEqual({ status: "connecting" });
    expect(wa.localAuthOpts[0]).toEqual({ clientId: "t1" });
  });

  it("spawns a single Chrome instance for concurrent connect calls", async () => {
    const [a, b] = await Promise.all([
      connectWhatsApp("t1"),
      connectWhatsApp("t1"),
    ]);

    expect(a).toEqual({ status: "connecting" });
    expect(b).toEqual({ status: "connecting" });
    expect(wa.instances.length).toBe(1);
  });

  it("reports already-connected tenants without spawning again", async () => {
    await connectWhatsApp("t1");
    const result = await connectWhatsApp("t1");

    expect(result.status).toBe("connected");
    expect(wa.instances.length).toBe(1);
  });

  it("throws a structured error when Chrome is missing", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation(() => false);

    await expect(connectWhatsApp("t1")).rejects.toMatchObject({ statusCode: 500 });
  });

  it("rejects a new connection over the concurrent cap", async () => {
    process.env.WHATSAPP_MAX_CONNECTED = "1";
    await connectWhatsApp("t1");

    await expect(connectWhatsApp("t2")).rejects.toMatchObject({ statusCode: 429 });
  });
});

function mockFetchResult(ok, status) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => ({}),
      text: async () => "unauthorized",
    }),
  );
}

describe("connectWhatsApp (cloud_api)", () => {
  it("validates credentials via the Meta Graph API and marks connected", async () => {
    setDoc({
      provider: "cloud_api",
      status: "disconnected",
      enabled: true,
      config: { accessToken: "tok", phoneNumberId: "pid" },
    });

    const result = await connectWhatsApp("t1");

    expect(result).toEqual({ status: "connected", provider: "cloud_api" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/pid?fields=id"),
      expect.objectContaining({ headers: { Authorization: "Bearer tok" } }),
    );
    expect(WhatsAppSetting.findByIdAndUpdate).toHaveBeenCalledWith(
      "doc1",
      { $set: { status: "connected", lastError: "", qrCode: "" } },
    );
  });

  it("does not re-validate when already connected", async () => {
    setDoc({
      provider: "cloud_api",
      status: "connected",
      enabled: true,
      config: { accessToken: "tok", phoneNumberId: "pid" },
    });

    await connectWhatsApp("t1");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects rejected credentials with a 400", async () => {
    mockFetchResult(false, 401);
    setDoc({
      provider: "cloud_api",
      status: "disconnected",
      enabled: true,
      config: { accessToken: "tok", phoneNumberId: "pid" },
    });

    await expect(connectWhatsApp("t1")).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("sendWhatsAppMessage", () => {
  it("returns 400 when WhatsApp is not enabled for the clinic", async () => {
    setDoc({ enabled: false });

    await expect(sendWhatsAppMessage("t1", "20123456789", "hi")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("returns 409 when no client is connected yet", async () => {
    setDoc({ enabled: true });

    await expect(sendWhatsAppMessage("t1", "20123456789", "hi")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("normalizes local numbers and delivers the message when connected", async () => {
    setDoc({ enabled: true });
    await connectWhatsApp("t1");
    wa.clientEvents.ready?.();

    await sendWhatsAppMessage("t1", "01012345678", "hello");

    const client = wa.instances[0];
    expect(client.sent).toEqual({ chatId: "201012345678@c.us", msg: "hello" });
  });

  it("returns 409 when the session has expired", async () => {
    setDoc({ enabled: true });
    await connectWhatsApp("t1");
    const client = wa.instances[0];
    client.info = null;

    await expect(sendWhatsAppMessage("t1", "20123456789", "hi")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("sends through the Cloud API with a normalized recipient", async () => {
    setDoc({
      provider: "cloud_api",
      status: "connected",
      enabled: true,
      config: { accessToken: "tok", phoneNumberId: "pid" },
    });

    const json = vi.fn().mockResolvedValue({});
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, json, text: async () => "" });

    await sendWhatsAppMessage("t1", "01012345678", "hi");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/pid/messages");
    expect(opts.headers).toMatchObject({ Authorization: "Bearer tok" });
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "201012345678", type: "text" });
    expect(body.text.body).toBe("hi");
  });

  it("rejects Cloud API sends when not connected", async () => {
    setDoc({
      provider: "cloud_api",
      status: "disconnected",
      enabled: true,
      config: { accessToken: "tok", phoneNumberId: "pid" },
    });

    await expect(sendWhatsAppMessage("t1", "20123456789", "hi")).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("updateWhatsAppSettings", () => {
  it("rejects unsupported providers", async () => {
    await expect(updateWhatsAppSettings("t1", { provider: "twilio" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("stores config only for the allow-listed keys", async () => {
    const doc = setDoc({ enabled: true });

    await updateWhatsAppSettings("t1", {
      config: { phoneNumberId: "pid", accessToken: "tok", evil: "injected" },
    });

    expect(doc.config.phoneNumberId).toBe("pid");
    expect(doc.config.accessToken).toBe("tok");
    expect(doc.config.evil).toBeUndefined();
    expect(doc.save).toHaveBeenCalled();
  });

  it("tears down the running client when WhatsApp is disabled", async () => {
    setDoc({ enabled: true });
    await connectWhatsApp("t1");
    expect(wa.destroyedLog.length).toBe(0);

    await updateWhatsAppSettings("t1", { enabled: false });

    expect(wa.destroyedLog.length).toBe(1);
  });

  it("kills the old client when the provider switches", async () => {
    setDoc({ enabled: true });
    await connectWhatsApp("t1");
    expect(wa.destroyedLog.length).toBe(0);

    await updateWhatsAppSettings("t1", { provider: "cloud_api" });

    expect(wa.destroyedLog.length).toBe(1);
  });
});

describe("disconnectWhatsApp", () => {
  it("marks the tenant disconnected even when no client exists", async () => {
    await disconnectWhatsApp("t9");

    expect(WhatsAppSetting.findOneAndUpdate).toHaveBeenCalledWith(
      { tenant: "t9" },
      { $set: { status: "disconnected", qrCode: "", lastError: "" } },
    );
  });
});

describe("whatsapp.controller", () => {
  let ctrl;

  beforeAll(async () => {
    ctrl = await import("../modules/whatsapp/whatsapp.controller.js");
  });

  function mockRes() {
    const res = { statusCode: 200, body: null, locals: {} };
    res.status = function (code) {
      this.statusCode = code;
      return this;
    };
    res.json = function (body) {
      this.body = body;
      return this;
    };
    return res;
  }

  function mockReq(overrides = {}) {
    return {
      params: {},
      query: {},
      validatedBody: {},
      user: { _id: "admin1", tenant: "t1" },
      _roleResolved: { isSystemAdmin: true },
      isImpersonation: false,
      ...overrides,
    };
  }

  function setupDoc(overrides = {}) {
    const doc = setDoc({ tenant: "t1", ...overrides });
    doc.toObject = vi.fn(() => {
      const result = {};
      for (const [key, value] of Object.entries(doc)) {
        if (typeof value !== "function") result[key] = value;
      }
      return result;
    });
    return doc;
  }

  describe("getSettings", () => {
    it("returns settings with sensitive fields stripped", async () => {
      setupDoc({
        status: "connected",
        enabled: true,
        config: { phoneNumber: "123", accessToken: "secret", session: "sess" },
        qrCode: "qr-data",
      });

      const res = mockRes();
      await ctrl.getSettings(mockReq(), res, vi.fn());

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("connected");
      expect(res.body.data.config?.accessToken).toBeUndefined();
      expect(res.body.data.config?.session).toBeUndefined();
      expect(res.body.data.qrCode).toBeUndefined();
    });
  });

  describe("updateSettings", () => {
    it("persists config changes", async () => {
      const doc = setupDoc({ provider: "whatsapp_web", enabled: false });
      const res = mockRes();
      await ctrl.updateSettings(
        mockReq({
          validatedBody: {
            provider: "cloud_api",
            config: { accessToken: "tok", phoneNumberId: "pid" },
          },
        }),
        res,
        vi.fn(),
      );
      expect(res.body.success).toBe(true);
      expect(doc.save).toHaveBeenCalled();
    });

    it("rejects unsupported providers", async () => {
      setupDoc();
      const next = vi.fn();
      await ctrl.updateSettings(
        mockReq({ validatedBody: { provider: "twilio" } }),
        mockRes(),
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe("connect", () => {
    it("initiates a connection for the tenant", async () => {
      setupDoc({ provider: "whatsapp_web", status: "disconnected", enabled: true });
      const res = mockRes();
      await ctrl.connect(mockReq(), res, vi.fn());
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("connecting");
    });
  });

  describe("disconnect", () => {
    it("disconnects the tenant and returns disconnected status", async () => {
      setupDoc({ status: "connected" });
      const res = mockRes();
      await ctrl.disconnect(mockReq(), res, vi.fn());
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("disconnected");
    });
  });

  describe("getQrCode", () => {
    it("returns the QR code and status", async () => {
      setupDoc({ status: "connecting", qrCode: "qr-payload" });
      const res = mockRes();
      await ctrl.getQrCode(mockReq(), res, vi.fn());
      expect(res.body.success).toBe(true);
      expect(res.body.data.qrCode).toBe("qr-payload");
      expect(res.body.data.status).toBe("connecting");
    });

    it("returns null when no QR code is available", async () => {
      setupDoc({ status: "disconnected", qrCode: "" });
      const res = mockRes();
      await ctrl.getQrCode(mockReq(), res, vi.fn());
      expect(res.body.success).toBe(true);
      expect(res.body.data.qrCode).toBeNull();
    });
  });

  describe("status", () => {
    it("returns combined status from settings and live client", async () => {
      setupDoc({ status: "connected", enabled: true, provider: "whatsapp_web" });
      const res = mockRes();
      await ctrl.status(mockReq(), res, vi.fn());
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("connected");
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data.provider).toBe("whatsapp_web");
    });
  });

  describe("testMessage", () => {
    it("sends a test message successfully", async () => {
      setupDoc({ enabled: true, status: "connecting" });
      await connectWhatsApp("t1");
      wa.clientEvents.ready?.();
      modelState.doc.status = "connected";

      const res = mockRes();
      await ctrl.testMessage(
        mockReq({ validatedBody: { to: "20123456789", message: "Hello from test" } }),
        res,
        vi.fn(),
      );
      expect(res.body.success).toBe(true);
      expect(res.body.data.sent).toBe(true);
      expect(res.body.data.to).toBe("20123456789");
    });

    it("rejects when the channel is still connecting", async () => {
      setupDoc({ status: "connecting" });
      const next = vi.fn();
      await ctrl.testMessage(
        mockReq({ validatedBody: { to: "20123456789", message: "Hello" } }),
        mockRes(),
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it("throttles after five test sends within the cooldown window", async () => {
      setupDoc({ status: "connected" });
      const req = mockReq({ validatedBody: { to: "20123456789", message: "msg" } });
      for (let i = 0; i < 5; i++) {
        const r = mockRes();
        await ctrl.testMessage(req, r, vi.fn());
      }
      const next = vi.fn();
      await ctrl.testMessage(req, mockRes(), next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 429 }),
      );
    });
  });
});