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

describe("csrfProtection (double-submit token fallback, cookie issuance)", () => {
  const CSRF_COOKIE = "_csrf=sometok123";

  it("issues a _csrf cookie on the first session-bearing response", async () => {
    const res = await request(makeApp())
      .get("/ping")
      .set("Cookie", SESSION_COOKIE);
    expect(res.status).toBe(200);
    const csrfCookie = res.headers["set-cookie"]?.find((c) => c.startsWith("_csrf="));
    expect(csrfCookie).toBeDefined();
    // Double-submit relies on the cookie being host-only + SameSite (NOT
    // readable by a cross-origin attacker site). Assert the cookie flags.
    expect(csrfCookie).toContain("SameSite=");
    expect(csrfCookie).toContain("Path=/");
  });

  it("allows a no-source request when the double-submit token matches (header)", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Cookie", `${SESSION_COOKIE}; ${CSRF_COOKIE}`)
      .set("X-CSRF-Token", "sometok123")
      .send({});
    expect(res.status).toBe(200);
  });

  it("allows a no-source request when the token matches in the body (_csrf field)", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Cookie", `${SESSION_COOKIE}; ${CSRF_COOKIE}`)
      .send({ _csrf: "sometok123" });
    expect(res.status).toBe(200);
  });

  it("blocks a no-source request with a mismatched double-submit token", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Cookie", `${SESSION_COOKIE}; ${CSRF_COOKIE}`)
      .set("X-CSRF-Token", "wrong-token")
      .send({});
    expect(res.status).toBe(403);
  });

  it("rejects a foreign Origin even when a valid double-submit token is present", async () => {
    // The Origin check stays primary — a token must not override a clearly
    // cross-origin source (csrf.js:89-91).
    const res = await request(makeApp())
      .post("/echo")
      .set("Origin", "https://evil.example")
      .set("Cookie", `${SESSION_COOKIE}; ${CSRF_COOKIE}`)
      .set("X-CSRF-Token", "sometok123")
      .send({});
    expect(res.status).toBe(403);
  });

  it("treats the request's own origin as allowed (self-origin)", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Host", "dentalos.test")
      .set("Origin", "http://dentalos.test")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    // selfOrigin = http://dentalos.test matches the Origin header.
    expect(res.status).toBe(200);
  });

  it("treats an allowed-origin request with a Referer from the same app as allowed", async () => {
    const res = await request(makeApp())
      .post("/echo")
      .set("Origin", "https://app.dentalos.example")
      .set("Referer", "https://app.dentalos.example")
      .set("Cookie", SESSION_COOKIE)
      .send({});
    expect(res.status).toBe(200);
  });
});
