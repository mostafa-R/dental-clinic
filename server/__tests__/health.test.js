import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app.js";

describe("GET /api/health", () => {
  it("returns 200 or 503 with a status field", async () => {
    const res = await request(app).get("/api/health");

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("status");
  });
});
