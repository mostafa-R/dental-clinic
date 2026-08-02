import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/platform/platformSetting.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../utils/jwt.js", () => ({ verifyAccessToken: vi.fn() }));

vi.mock("../utils/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

import { maintenance, clearMaintenanceCache } from "../middleware/maintenance.js";
import PlatformSetting from "../modules/platform/platformSetting.model.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { cacheDel, cacheGet } from "../utils/cache.js";

function makeReq(path, { cookie, bearer } = {}) {
  const headers = {};
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return { path, headers, cookies: cookie ? { site_access: cookie } : {} };
}

function run(req) {
  const next = vi.fn();
  return maintenance(req, {}, next).then(() => next);
}

describe("maintenance middleware", () => {
  beforeEach(() => {
    vi.mocked(cacheGet).mockResolvedValue(false);
    vi.mocked(PlatformSetting.findOne).mockResolvedValue(null);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearMaintenanceCache();
  });

  it("passes everything through when maintenance is off", async () => {
    vi.mocked(cacheGet).mockResolvedValue(false);

    const next = await run(makeReq("/patients"));

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("blocks clinic requests with 503 when maintenance is on", async () => {
    vi.mocked(cacheGet).mockResolvedValue(true);

    const next = await run(makeReq("/patients"));

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 503 });
  });

  it("always allows the site auth flow so admins can log in", async () => {
    vi.mocked(cacheGet).mockResolvedValue(true);

    const next = await run(makeReq("/site/auth/login"));

    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("allows requests carrying a valid site-admin token", async () => {
    vi.mocked(cacheGet).mockResolvedValue(true);
    vi.mocked(verifyAccessToken).mockReturnValue({ type: "site" });

    const next = await run(makeReq("/site/tenants", { cookie: "site-tok" }));

    expect(verifyAccessToken).toHaveBeenCalledWith("site-tok");
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("blocks requests with an invalid site token when maintenance is on", async () => {
    vi.mocked(cacheGet).mockResolvedValue(true);
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new Error("bad token");
    });

    const next = await run(makeReq("/site/tenants", { bearer: "bad" }));

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 503 });
  });

  it("falls back to the database flag when the cache is empty", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(PlatformSetting.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ maintenanceMode: true }),
      }),
    });

    const next = await run(makeReq("/patients"));

    expect(PlatformSetting.findOne).toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 503 });
  });

  it("drops the cached flag so a fresh read happens after toggling", async () => {
    await clearMaintenanceCache();

    expect(cacheDel).toHaveBeenCalledWith("platform", "maintenance");
  });
});
