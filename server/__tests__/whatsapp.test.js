import { beforeEach, describe, expect, it, vi } from "vitest";

const wa = vi.hoisted(() => {
  const clientEvents = {};
  const localAuthOpts = [];
  const instances = [];
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
    async destroy() {}
    async sendMessage(chatId, msg) {
      this.sent = { chatId, msg };
    }
  }
  class MockLocalAuth {
    constructor(opts) {
      localAuthOpts.push(opts);
    }
  }
  return { clientEvents, localAuthOpts, instances, MockClient, MockLocalAuth };
});

vi.mock("whatsapp-web.js", () => ({
  Client: wa.MockClient,
  LocalAuth: wa.MockLocalAuth,
}));

vi.mock("../modules/whatsapp/whatsappSetting.model.js", () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import fs from "fs";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  sendWhatsAppMessage,
} from "../services/whatsapp.js";
import WhatsAppSetting from "../modules/whatsapp/whatsappSetting.model.js";

beforeEach(async () => {
  vi.clearAllMocks();
  wa.clientEvents = {};
  wa.localAuthOpts.length = 0;
  wa.instances.length = 0;
  process.env.CHROME_PATH = "C:\\fake\\chrome.exe";
  vi.spyOn(fs, "existsSync").mockImplementation(
    (p) => p === process.env.CHROME_PATH,
  );
  await disconnectWhatsApp("t1");
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CHROME_PATH;
});

describe("connectWhatsApp", () => {
  it("uses a per-tenant LocalAuth clientId so sessions persist", async () => {
    vi.mocked(WhatsAppSetting.findOneAndUpdate).mockResolvedValue({});

    const result = await connectWhatsApp("t1");

    expect(result).toEqual({ status: "connecting" });
    expect(wa.localAuthOpts[0]).toEqual({ clientId: "t1" });
  });

  it("spawns a single Chrome instance for concurrent connect calls", async () => {
    vi.mocked(WhatsAppSetting.findOneAndUpdate).mockResolvedValue({});

    const [a, b] = await Promise.all([
      connectWhatsApp("t1"),
      connectWhatsApp("t1"),
    ]);

    expect(a).toEqual({ status: "connecting" });
    expect(b).toEqual({ status: "connecting" });
    expect(wa.instances.length).toBe(1);
  });

  it("throws a structured error when Chrome is missing", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation(() => false);

    await expect(connectWhatsApp("t1")).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("sendWhatsAppMessage", () => {
  it("returns 400 when WhatsApp is not enabled for the clinic", async () => {
    vi.mocked(WhatsAppSetting.findOne).mockResolvedValue({ enabled: false });

    await expect(sendWhatsAppMessage("t1", "20123456789", "hi")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("returns 409 when no client is connected yet", async () => {
    vi.mocked(WhatsAppSetting.findOne).mockResolvedValue({ enabled: true });

    await expect(sendWhatsAppMessage("t1", "20123456789", "hi")).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("normalizes the chat id and delivers the message when connected", async () => {
    vi.mocked(WhatsAppSetting.findOneAndUpdate).mockResolvedValue({});
    await connectWhatsApp("t1");
    wa.clientEvents.ready?.();

    await sendWhatsAppMessage("t1", "20123456789", "hello");

    const client = wa.instances[0];
    expect(client.sent).toEqual({ chatId: "20123456789@c.us", msg: "hello" });
  });

  it("returns 409 when the session has expired", async () => {
    vi.mocked(WhatsAppSetting.findOneAndUpdate).mockResolvedValue({});
    await connectWhatsApp("t1");
    const client = wa.instances[0];
    client.info = null;

    await expect(sendWhatsAppMessage("t1", "20123456789", "hi")).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe("disconnectWhatsApp", () => {
  it("marks the tenant disconnected even when no client exists", async () => {
    vi.mocked(WhatsAppSetting.findOneAndUpdate).mockResolvedValue({});

    await disconnectWhatsApp("t9");

    expect(WhatsAppSetting.findOneAndUpdate).toHaveBeenCalledWith(
      { tenant: "t9" },
      { $set: { status: "disconnected", qrCode: "", lastError: "" } },
    );
  });
});
