import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/site/tenant/tenant.service.js", () => ({
  listTenants: vi.fn(),
}));

import * as tenantService from "../modules/site/tenant/tenant.service.js";
import { getTenants } from "../modules/site/tenant/site.controller.js";

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("getTenants controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantService.listTenants.mockResolvedValue({ tenants: [], pagination: {} });
  });

  it("forwards dormant and trialExpiring query params to the service", async () => {
    const req = { query: { page: "2", limit: "25", dormant: "true", trialExpiring: "7" } };
    const res = mockRes();

    await getTenants(req, res, vi.fn());

    expect(tenantService.listTenants).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      status: undefined,
      plan: undefined,
      search: undefined,
      dormant: "true",
      trialExpiring: "7",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("caps the limit at 100 and defaults the page", async () => {
    const req = { query: { limit: "500" } };
    const res = mockRes();

    await getTenants(req, res, vi.fn());

    expect(tenantService.listTenants).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 100 }),
    );
  });
});
