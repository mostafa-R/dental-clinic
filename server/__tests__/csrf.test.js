import { describe, expect, it } from "vitest";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";

import { csrfProtection } from "../middleware/csrf.js";

const ALLOWED = ["http://localhost:5173", "https://app.dentalos.example"];

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtection(ALLOWED));
  app.post("/echo", (_req, res) => res.status(200).json({ ok: true, method: "POST" }));
  app.patch("/echo", (_req, res) => res.status(200).json({ ok: true, method: "PATCH" }));
  app.get("/ping", (_req, res) => res.status(200).json({ ok: true, method: "GET" }));
  app.use((err, _req, res, _next) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message }),
  );
  return app;
}

const SESSION_COOKIE = "access_token=abc.def.ghi";

describe("csrfProtection (Origin/Referer check)", () => {
  it("allows a state-changing request when Origin matches an allowed origin", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("allows a state-changing request when Referer matches an allowed origin", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Referer", "https://app.dentalos.example/settings")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(200);
  });

  it("blocks a state-changing request with a foreign Origin and a session cookie", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Origin", "https://evil.example")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it("blocks a state-changing request with a session cookie but no Origin/Referer", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(403);
  });

  it("blocks a state-changing request with a foreign Referer and a session cookie", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Referer", "https://evil.example/phishing")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(403);
  });

  it("allows a state-changing request without a session cookie (no CSRF surface)", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Origin", "https://evil.example")
      .send({});
    expect(res.status).toBe(200);
  });

  it("always allows safe methods regardless of Origin/cookie", async () => {
    const res = await request(makeApp())
      .get("/ping")
      .set("Origin", "https://evil.example")
      .set("Cookie", SESSION_COOKIE);
    expect(res.status).toBe(200);
  });

  it("blocks when only the origin:null opaque origin is provided", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Origin", "null")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(403);
  });
});
