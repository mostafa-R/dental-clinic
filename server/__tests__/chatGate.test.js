import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

vi.mock("../modules/chat/chat.service.js", () => ({
  sendMessage: vi.fn(),
  listMessages: vi.fn(),
  markRead: vi.fn(),
  markChannelViewed: vi.fn(),
  getUnreadCounts: vi.fn(),
  listStaff: vi.fn(),
}));

vi.mock("../socket/index.js", () => ({ emitToChat: vi.fn() }));

vi.mock("../middleware/auth.js", () => ({ protect: vi.fn() }));

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

import chatRouter from "../modules/chat/chat.routes.js";
import * as chatService from "../modules/chat/chat.service.js";
import { protect } from "../middleware/auth.js";
import { getCachedRole } from "../utils/cache.js";
import { emitToChat } from "../socket/index.js";

const FULL_CHAT_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "chat", actions: ["create", "read", "update"] }],
};

const NO_CHAT_ROLE = {
  _id: "r1",
  tenant: null,
  isSystemAdmin: false,
  permissions: [{ module: "patients", actions: ["read"] }],
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/chat", chatRouter);
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

let currentUser = { _id: "u1", branch: "b1", roleId: "r1", tenant: null };

describe("chat routes — role and plan gating", () => {
  beforeEach(() => {
    currentUser = { _id: "u1", branch: "b1", roleId: "r1", tenant: null };
    vi.mocked(getCachedRole).mockResolvedValue(FULL_CHAT_ROLE);
    vi.mocked(protect).mockImplementation((req, _res, next) => {
      if (!req.cookies?.access_token) {
        return next(Object.assign(new Error("Not authenticated"), { statusCode: 401 }));
      }
      req.user = currentUser;
      next();
    });
  });

  it("lets a role with chat:create send a message", async () => {
    vi.mocked(chatService.sendMessage).mockResolvedValue({
      message: { _id: "m1", content: "hello" },
      sender: { _id: "u1", name: "Dr Test" },
    });
    const res = await request(makeApp())
      .post("/api/chat")
      .set("Cookie", "access_token=tok")
      .send({ recipient: "64b0000000000000000000a1", content: "hello" });
    expect(res.status).toBe(201);
    expect(emitToChat).toHaveBeenCalled();
  });

  it("denies sending when the role lacks chat:create (403)", async () => {
    vi.mocked(getCachedRole).mockResolvedValue(NO_CHAT_ROLE);
    const res = await request(makeApp())
      .post("/api/chat")
      .set("Cookie", "access_token=tok")
      .send({ recipient: "u2", channel: "direct", content: "hello" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("do not have permission to create chat");
  });

  it("denies reading when the plan does not include chat (403)", async () => {
    currentUser = { ...currentUser, tenant: { _id: "t1", planModules: ["dashboard", "patients"] } };
    const res = await request(makeApp())
      .get("/api/chat")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("does not include the chat module");
  });

  it("requires a session for chat routes (401)", async () => {
    const res = await request(makeApp()).get("/api/chat");
    expect(res.status).toBe(401);
  });
});
