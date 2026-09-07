import { describe, expect, it, vi } from "vitest";

vi.mock("../modules/site/admin/admin.model.js", () => {
  class MockSiteAdmin {}
  MockSiteAdmin.findOneAndUpdate = vi.fn();
  return { default: MockSiteAdmin };
});

import SiteAdmin from "../modules/site/admin/admin.model.js";
import {
  refreshSiteAdmin,
  rotateSiteAdminToken,
} from "../modules/site/auth/siteAuth.service.js";

describe("siteAuth.service — refresh token rotation", () => {
  it("refreshSiteAdmin accepts when the token version matches", async () => {
    const ok = await refreshSiteAdmin(
      { tokenVersion: 3, sub: "a1" },
      3,
    );
    expect(ok).toBe(true);
  });

  it("refreshSiteAdmin rejects a stale token version", async () => {
    const ok = await refreshSiteAdmin(
      { tokenVersion: 2, sub: "a1" },
      3,
    );
    expect(ok).toBe(false);
  });

  it("rotateSiteAdminToken performs an atomic compare-and-swap on tokenVersion", async () => {
    const admin = { _id: "a1", tokenVersion: 4 };
    vi.mocked(SiteAdmin.findOneAndUpdate).mockResolvedValue({ _id: "a1", tokenVersion: 5 });

    const updated = await rotateSiteAdminToken(admin, { tokenVersion: 4 });

    expect(updated).toMatchObject({ _id: "a1", tokenVersion: 5 });
    expect(SiteAdmin.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "a1", tokenVersion: 4 },
      { $inc: { tokenVersion: 1 } },
      { returnDocument: "after" },
    );
  });

  it("rotateSiteAdminToken falls back to the document version when decoded has none", async () => {
    const admin = { _id: "a1", tokenVersion: 9 };
    vi.mocked(SiteAdmin.findOneAndUpdate).mockResolvedValue({ _id: "a1", tokenVersion: 10 });

    const updated = await rotateSiteAdminToken(admin, {});

    expect(SiteAdmin.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "a1", tokenVersion: 9 },
      { $inc: { tokenVersion: 1 } },
      { returnDocument: "after" },
    );
    expect(updated.tokenVersion).toBe(10);
  });

  it("rotateSiteAdminToken returns null when the version is already rotated (replay blocked)", async () => {
    const admin = { _id: "a1", tokenVersion: 5 };
    vi.mocked(SiteAdmin.findOneAndUpdate).mockResolvedValue(null);

    const updated = await rotateSiteAdminToken(admin, { tokenVersion: 4 });

    expect(updated).toBeNull();
  });
});