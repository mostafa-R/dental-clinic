import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import {
  securityHeaders,
  requestSizeLimiter,
  securityAudit,
} from "../middleware/security.js";

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
});
