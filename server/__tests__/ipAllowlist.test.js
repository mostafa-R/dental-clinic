import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/platform/platformSetting.model.js", () => ({
  default: { findOne: vi.fn() },
}));

vi.mock("../utils/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

import { ipAllowlist, clearIpAllowlistCache } from "../middleware/ipAllowlist.js";
import PlatformSetting from "../modules/platform/platformSetting.model.js";
import { cacheDel, cacheGet } from "../utils/cache.js";

function makeReq(path, method, ip) {
  return { path, method, ip, socket: { remoteAddress: ip } };
}

function run(req) {
  const next = vi.fn();
  return ipAllowlist(req, {}, next).then(() => next);
}

describe("ipAllowlist middleware", () => {
  beforeEach(() => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(PlatformSetting.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ allowedSiteIps: "" }),
      }),
    });
    delete process.env.ALLOWED_SITE_IPS;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.ALLOWED_SITE_IPS;
    await clearIpAllowlistCache();
  });

  it("does not restrict non-site routes", async () => {
    process.env.ALLOWED_SITE_IPS = "203.0.113.5";

    const next = await run(makeReq("/patients", "POST", "198.51.100.9"));

    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("does not restrict GET requests on site routes", async () => {
    process.env.ALLOWED_SITE_IPS = "203.0.113.5";

    const next = await run(makeReq("/site/tenants", "GET", "198.51.100.9"));

    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("always allows site auth and 2FA writes", async () => {
    process.env.ALLOWED_SITE_IPS = "203.0.113.5";

    const login = await run(makeReq("/site/auth/login", "POST", "198.51.100.9"));
    expect(login.mock.calls[0][0]).toBeUndefined();

    const verify = await run(makeReq("/site/2fa/verify", "POST", "198.51.100.9"));
    expect(verify.mock.calls[0][0]).toBeUndefined();
  });

  it("passes when no allowlist is configured", async () => {
    const next = await run(makeReq("/site/tenants", "POST", "198.51.100.9"));

    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("allows a matching exact IP from env", async () => {
    process.env.ALLOWED_SITE_IPS = "203.0.113.5";

    const next = await run(makeReq("/site/tenants", "POST", "203.0.113.5"));

    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("blocks a non-matching IP with 403", async () => {
    process.env.ALLOWED_SITE_IPS = "203.0.113.5";

    const next = await run(makeReq("/site/tenants", "POST", "198.51.100.9"));

    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });

  it("supports CIDR ranges from the platform setting", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(PlatformSetting.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ allowedSiteIps: "203.0.113.0/24" }),
      }),
    });

    const inside = await run(makeReq("/site/tenants", "POST", "203.0.113.99"));
    expect(inside.mock.calls[0][0]).toBeUndefined();

    const outside = await run(makeReq("/site/tenants", "POST", "203.0.114.1"));
    expect(outside.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
  });

  it("normalizes IPv4-mapped IPv6 client addresses", async () => {
    process.env.ALLOWED_SITE_IPS = "203.0.113.5";

    const next = await run(
      makeReq("/site/tenants", "POST", "::ffff:203.0.113.5"),
    );

    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it("clears the cache so new settings take effect", async () => {
    await clearIpAllowlistCache();

    expect(cacheDel).toHaveBeenCalledWith("platform", "siteIpAllowlist");
  });
});
