import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import {
  securityHeaders,
  requestSizeLimiter,
  securityAudit,
} from "../middleware/security.js";
import { logError } from "../middleware/logError.js";
import ErrorLog from "../modules/site/errorLog/errorLog.model.js";

vi.mock("../modules/site/errorLog/errorLog.model.js", () => ({
  default: { create: vi.fn() },
}));

// NOTE: sanitizeInput / sqlInjectionProtection were intentionally removed
// (they false-positived on legitimate clinical text like "<5mm pocket" and
// notes containing words like "create"/"update"). Zod validators in each
// module enforce input schemas instead.

describe("Security Middleware", () => {
  describe("securityHeaders", () => {
    it("adds security headers to responses", async () => {
      const app = express();
      app.use(securityHeaders);
      app.get("/test", (_req, res) => res.json({ ok: true }));

      const res = await request(app).get("/test");

      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(res.headers["permissions-policy"]).toContain("camera=()");
    });
  });

  describe("requestSizeLimiter", () => {
    it("blocks requests over the configured size", async () => {
      const app = express();
      app.use(express.json());
      app.use(requestSizeLimiter("1kb"));
      app.post("/test", (_req, res) => res.json({ success: true }));
      // Mirror the real app's errorHandler so ApiError -> JSON response
      app.use((err, _req, res, _next) =>
        res.status(err.statusCode || 500).json({
          success: false,
          message: err.message,
        }),
      );

      const largePayload = { data: "x".repeat(2000) };
      const res = await request(app).post("/test").send(largePayload);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("Request too large");
    });

    it("allows requests within the limit", async () => {
      const app = express();
      app.use(express.json());
      app.use(requestSizeLimiter("10kb"));
      app.post("/test", (_req, res) => res.json({ success: true }));

      const res = await request(app)
        .post("/test")
        .send({ data: "normal size" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("securityAudit", () => {
    it("passes requests through without altering responses", async () => {
      const app = express();
      app.use(securityAudit);
      app.get("/ok", (_req, res) => res.status(200).json({ success: true }));

      const res = await request(app).get("/ok");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("logError middleware", () => {
    beforeEach(() => {
      ErrorLog.create.mockReset();
      ErrorLog.create.mockResolvedValue({});
    });

    it("persists server errors (>=500) with redacted secrets and forwards to next", () => {
      const err = new Error("auth failed password=hunter22 token=abc1234567890");
      err.statusCode = 500;
      const next = vi.fn();
      logError(
        err,
        {
          tenant: { _id: "t1" },
          method: "POST",
          originalUrl: "/api/appointments",
          id: "req-abc",
          ip: "203.0.113.9",
          headers: { "user-agent": "curl/x" },
        },
        {},
        next,
      );

      expect(ErrorLog.create).toHaveBeenCalledTimes(1);
      const [args] = ErrorLog.create.mock.calls[0];
      expect(args.method).toBe("POST");
      expect(args.url).toBe("/api/appointments");
      expect(args.statusCode).toBe(500);
      expect(args.tenant).toBe("t1");
      expect(args.requestId).toBe("req-abc");
      expect(args.ip).toBe("203.0.113.9");
      expect(args.message).toBe("auth failed password= [REDACTED] token= [REDACTED]");
      expect(next).toHaveBeenCalledWith(err);
    });

    it("does not persist client errors (4xx)", () => {
      const err = new Error("bad request");
      err.statusCode = 400;
      const next = vi.fn();
      logError(err, { tenant: { _id: "t1" }, method: "GET", originalUrl: "/api/x", headers: {} }, {}, next);
      expect(ErrorLog.create).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(err);
    });

    it("treats errors without a status code as 500", () => {
      const next = vi.fn();
      logError(new Error("boom"), { tenant: { _id: "t1" }, method: "GET", originalUrl: "/api/x", headers: {} }, {}, next);
      expect(ErrorLog.create).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    });

    it("falls back to the x-forwarded-for header for the IP and nulls missing ids", () => {
      const next = vi.fn();
      logError(
        { message: "boom", statusCode: 500 },
        {
          method: "GET",
          originalUrl: "/api/x",
          headers: { "x-forwarded-for": "198.51.100.7", "user-agent": "curl/x" },
        },
        {},
        next,
      );
      expect(ErrorLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenant: null, requestId: null, ip: "198.51.100.7" }),
      );
    });

    it("truncates long messages and stacks, and swallows create failures", async () => {
      const longMessage = "x".repeat(2000);
      ErrorLog.create.mockRejectedValueOnce(new Error("db down"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const next = vi.fn();
      logError(
        { statusCode: 500, message: longMessage, stack: longMessage },
        { method: "GET", originalUrl: "/api/x", headers: { "user-agent": "curl/x" } },
        {},
        next,
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(ErrorLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "x".repeat(500),
          stack: "x".repeat(2000),
        }),
      );
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
