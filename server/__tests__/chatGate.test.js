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
import {
  sendChatMessage,
  listChatMessages,
  markMessagesRead,
  getUnreadCounts,
  listStaffForChat,
  markChannelRead,
} from "../modules/chat/chat.controller.js";

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

  it("rejects listing messages without recipient or channel (no branch-wide leak)", async () => {
    const res = await request(makeApp())
      .get("/api/chat")
      .set("Cookie", "access_token=tok");
    expect(res.status).toBe(400);
    expect(chatService.listMessages).not.toHaveBeenCalled();
  });

  it("rejects listing messages with both recipient and channel", async () => {
    const res = await request(makeApp())
      .get("/api/chat")
      .set("Cookie", "access_token=tok")
      .query({ recipient: "64b0000000000000000000a1", channel: "general" });
    expect(res.status).toBe(400);
    expect(chatService.listMessages).not.toHaveBeenCalled();
  });

  it("allows listing a specific DM or channel conversation", async () => {
    vi.mocked(chatService.listMessages).mockResolvedValue([]);
    const res = await request(makeApp())
      .get("/api/chat")
      .set("Cookie", "access_token=tok")
      .query({ recipient: "64b0000000000000000000a1" });
    expect(res.status).toBe(200);
    expect(chatService.listMessages).toHaveBeenCalled();
  });
});

describe("chat.controller", () => {
  function mockRes() {
    return {
      statusCode: null,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
  }

  function mockReq({ user = { _id: "u1", branch: "b1", tenant: null }, validatedBody, validatedQuery } = {}) {
    return { user, validatedBody, validatedQuery };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendChatMessage", () => {
    it("sends a message and broadcasts chat:message", async () => {
      const message = { _id: "m1", content: "hello", channel: "general" };
      const sender = { _id: "u1", name: "Dr Test" };
      vi.mocked(chatService.sendMessage).mockResolvedValue({ message, sender });

      const res = mockRes();
      const next = vi.fn();
      await sendChatMessage(
        mockReq({
          user: { _id: "u1", branch: { _id: "b1" }, tenant: null },
          validatedBody: { recipient: "u9", content: "hello" },
        }),
        res,
        next,
      );

      expect(next).not.toHaveBeenCalled();
      expect(chatService.sendMessage).toHaveBeenCalledWith({
        branch: { _id: "b1" },
        tenant: null,
        senderId: "u1",
        recipient: "u9",
        channel: undefined,
        content: "hello",
      });
      expect(emitToChat).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "u9",
          senderId: "u1",
          event: "chat:message",
          tenantId: null,
          branchId: "b1",
          payload: { ...message, sender },
        }),
      );
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ success: true, data: { message } });
    });

    it("includes the resolved tenant id in the broadcast", async () => {
      vi.mocked(chatService.sendMessage).mockResolvedValue({
        message: { _id: "m1", content: "hello" },
        sender: { _id: "u1" },
      });

      const res = mockRes();
      await sendChatMessage(
        mockReq({
          user: { _id: "u1", branch: "b1", tenant: "64b000000000000000000001" },
          validatedBody: { recipient: "u9", content: "hello" },
        }),
        res,
        vi.fn(),
      );

      expect(emitToChat).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "u9",
          tenantId: "64b000000000000000000001",
          branchId: "b1",
        }),
      );
    });

    it("forbids users without an assigned branch and does not broadcast", async () => {
      const res = mockRes();
      const next = vi.fn();
      await sendChatMessage(
        mockReq({ user: { _id: "u1", branch: null, tenant: null }, validatedBody: { recipient: "u9", content: "hi" } }),
        res,
        next,
      );

      expect(chatService.sendMessage).not.toHaveBeenCalled();
      expect(emitToChat).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
  });

  describe("listChatMessages", () => {
    it("returns messages for the user's branch with the user scoped in", async () => {
      const messages = [{ _id: "m1", content: "hi" }];
      vi.mocked(chatService.listMessages).mockResolvedValue(messages);

      const res = mockRes();
      await listChatMessages(
        mockReq({ user: { _id: "u1", branch: "b1", tenant: null }, validatedQuery: { limit: 50 } }),
        res,
        vi.fn(),
      );

      expect(chatService.listMessages).toHaveBeenCalledWith("b1", { limit: 50, senderId: "u1" });
      expect(res.body).toEqual({ success: true, data: { messages } });
    });

    it("forbids users without a branch", async () => {
      const next = vi.fn();
      await listChatMessages(mockReq({ user: { _id: "u1", branch: null, tenant: null } }), mockRes(), next);
      expect(chatService.listMessages).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
  });

  describe("markMessagesRead", () => {
    it("marks messages read and emits chat:read to every sender", async () => {
      const messageIds = ["64b0000000000000000000a1", "64b0000000000000000000a2"];
      vi.mocked(chatService.markRead).mockResolvedValue({ updated: 2, senders: ["u2", "u3"] });

      const res = mockRes();
      await markMessagesRead(
        mockReq({ user: { _id: "u1", branch: "b1", tenant: null }, validatedBody: { messageIds } }),
        res,
        vi.fn(),
      );

      expect(chatService.markRead).toHaveBeenCalledWith("b1", "u1", messageIds);
      expect(emitToChat).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ recipient: "u2", event: "chat:read", payload: { messageIds, readerId: "u1" } }),
      );
      expect(emitToChat).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ recipient: "u3", event: "chat:read", payload: { messageIds, readerId: "u1" } }),
      );
      expect(res.body).toEqual({ success: true, data: { updated: 2 } });
    });

    it("emits nothing when no senders were touched", async () => {
      vi.mocked(chatService.markRead).mockResolvedValue({ updated: 0, senders: [] });
      const res = mockRes();
      await markMessagesRead(
        mockReq({ user: { _id: "u1", branch: "b1", tenant: null }, validatedBody: { messageIds: ["64b0000000000000000000a1"] } }),
        res,
        vi.fn(),
      );
      expect(emitToChat).not.toHaveBeenCalled();
      expect(res.body).toEqual({ success: true, data: { updated: 0 } });
    });
  });

  describe("getUnreadCounts", () => {
    it("returns unread counts scoped to branch, user and tenant", async () => {
      const unread = { "u2": 3, doctors: 1 };
      vi.mocked(chatService.getUnreadCounts).mockResolvedValue(unread);

      const res = mockRes();
      await getUnreadCounts(
        mockReq({ user: { _id: "u1", branch: "b1", tenant: "64b000000000000000000001" } }),
        res,
        vi.fn(),
      );

      expect(chatService.getUnreadCounts).toHaveBeenCalledWith("b1", "u1", expect.anything());
      expect(res.body).toEqual({ success: true, data: { unread } });
    });
  });

  describe("listStaffForChat", () => {
    it("returns the branch staff list", async () => {
      const staff = [{ _id: "u2", name: "Dr Two" }];
      vi.mocked(chatService.listStaff).mockResolvedValue(staff);

      const res = mockRes();
      await listStaffForChat(
        mockReq({ user: { _id: "u1", branch: "b1", tenant: null } }),
        res,
        vi.fn(),
      );

      expect(chatService.listStaff).toHaveBeenCalledWith("b1", null, "u1");
      expect(res.body).toEqual({ success: true, data: { staff } });
    });
  });

  describe("markChannelRead", () => {
    it("marks a channel viewed and returns ok", async () => {
      const res = mockRes();
      await markChannelRead(
        mockReq({ user: { _id: "u1", branch: "b1", tenant: null }, validatedBody: { channel: "general" } }),
        res,
        vi.fn(),
      );

      expect(chatService.markChannelViewed).toHaveBeenCalledWith("b1", "u1", "general", null);
      expect(res.body).toEqual({ success: true, data: { ok: true } });
    });

    it("forbids users without a branch", async () => {
      const next = vi.fn();
      await markChannelRead(
        mockReq({ user: { _id: "u1", branch: null, tenant: null }, validatedBody: { channel: "general" } }),
        mockRes(),
        next,
      );
      expect(chatService.markChannelViewed).not.toHaveBeenCalled();
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
  });
});
