import { it } from "vitest";
import request from "supertest";
import app from "../app.js";

it("probe login paths", async () => {
  const payload = { email: "probe@example.io", password: "short" };
  for (let i = 0; i < 3; i++) {
    for (const path of ["/api/v1/auth/login", "/api/auth/login"]) {
      const t0 = Date.now();
      const res = await request(app).post(path).send(payload);
      console.log(`req${i}`, path, "->", res.status, "in", Date.now() - t0, "ms");
    }
  }
}, 120000);
