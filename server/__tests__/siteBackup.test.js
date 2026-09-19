import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/backup.js", () => ({
  performBackup: vi.fn(),
  listBackups: vi.fn(),
  getBackupById: vi.fn(),
}));

import { performBackup, listBackups, getBackupById } from "../services/backup.js";
import {
  getBackups,
  getBackup,
  triggerManualBackup,
} from "../modules/site/backup/siteBackup.controller.js";

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function mockReq(overrides = {}) {
  return { query: {}, params: {}, siteAdmin: null, ...overrides };
}

const noopNext = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("siteBackup.controller", () => {
  it("getBackups parses paging and caps the limit at 100", async () => {
    listBackups.mockResolvedValue({ logs: [], page: 1, limit: 100, total: 0, pages: 0 });
    const res = mockRes();
    await getBackups(mockReq({ query: { page: "2", limit: "9999" } }), res, noopNext);

    expect(listBackups).toHaveBeenCalledWith(2, 100);
    expect(res.body).toMatchObject({ success: true, data: { page: 1 } });
  });

  it("getBackups falls back to page 1 / limit 20 for bad input", async () => {
    listBackups.mockResolvedValue({ logs: [], page: 1, limit: 20, total: 0, pages: 0 });
    await getBackups(mockReq({ query: { page: "abc", limit: "0" } }), mockRes(), noopNext);
    expect(listBackups).toHaveBeenCalledWith(1, 20);
  });

  it("getBackup returns a single log", async () => {
    getBackupById.mockResolvedValue({ _id: "b1", status: "completed" });
    const res = mockRes();
    await getBackup(mockReq({ params: { id: "b1" } }), res, noopNext);
    expect(res.body.data).toMatchObject({ _id: "b1", status: "completed" });
  });

  it("getBackup forwards a notFound error when the log is missing", async () => {
    getBackupById.mockResolvedValue(null);
    const next = vi.fn();
    await getBackup(mockReq({ params: { id: "missing" } }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it("triggerManualBackup runs a manual backup attributed to the site admin", async () => {
    performBackup.mockResolvedValue({ _id: "b2", type: "manual", status: "completed" });
    const res = mockRes();
    await triggerManualBackup(mockReq({ siteAdmin: { _id: "admin1" } }), res, noopNext);
    expect(performBackup).toHaveBeenCalledWith("manual", "admin1");
    expect(res.body.data.status).toBe("completed");
  });

  it("triggerManualBackup passes null when there is no site admin context", async () => {
    performBackup.mockResolvedValue({ _id: "b3", type: "manual" });
    await triggerManualBackup(mockReq(), mockRes(), noopNext);
    expect(performBackup).toHaveBeenCalledWith("manual", null);
  });

  it("routes async failures to next via asyncHandler", async () => {
    listBackups.mockRejectedValue(new Error("db down"));
    const next = vi.fn();
    await getBackups(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});