import request from "supertest";
import app from "./app.js";

describe("Swagger docs", () => {
  it("serves the swagger UI HTML", async () => {
    const res = await request(app).get("/api/docs/").redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });

  it("serves the OpenAPI JSON", async () => {
    const res = await request(app).get("/api/docs.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.0.0");
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(100);
  });

  it("documents the health, auth and attachment download endpoints", async () => {
    const res = await request(app).get("/api/docs.json");
    expect(res.body.paths["/api/health"]).toBeTruthy();
    expect(res.body.paths["/api/v1/auth/login"]).toBeTruthy();
    expect(res.body.paths["/api/v1/emr/attachments/{filename}/download"]).toBeTruthy();
    expect(res.body.paths["/api/v1/emr/attachments/{filename}"].delete).toBeTruthy();
  });

  it("relaxes CSP only for docs routes so the UI can load", async () => {
    const res = await request(app).get("/api/docs/").redirects(1);
    const csp = res.headers["content-security-policy"];
    expect(csp).toContain("unsafe-inline");
  });
});
