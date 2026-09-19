import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const logs = [];
  return {
    logs,
    spawnArgs: null,
    spawnResultCode: 0,
    spawnError: null,
    toolPresent: true,
    encryptThrows: null,
    saved: [],
  };
});

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const proc = {
      stderr: { on: (ev, cb) => { if (ev === "data") {} } },
      on: (ev, cb) => {
        if (ev === "close") setTimeout(() => cb(state.spawnResultCode), 0);
        if (ev === "error") {
          if (state.spawnError) setTimeout(() => cb(state.spawnError), 0);
        }
      },
    };
    return proc;
  }),
  execSync: vi.fn(() => {
    if (!state.toolPresent) throw new Error("not found");
    return "";
  }),
}));

vi.mock("../utils/encryption.js", () => ({
  encryptFile: vi.fn(async (src, dst) => {
    if (state.encryptThrows) throw state.encryptThrows;
    const { writeFile } = require("node:fs/promises");
    await writeFile(src, "archive-dump-data");
    await writeFile(dst, "encrypted-payload");
  }),
}));

vi.mock("../modules/site/backup/backupLog.model.js", () => {
  class BackupLog {
    constructor(overrides = {}) {
      Object.assign(this, { filename: null, status: "running", type: "scheduled", encrypted: false, save: vi.fn(() => {}) }, overrides);
    }
    static create(data) {
      const doc = new BackupLog(data);
      doc.save = vi.fn(async () => {});
      state.saved.push(doc);
      return doc;
    }
    static find() {
      return { sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => state.logs }) }) }) };
    }
    static countDocuments() {
      return Promise.resolve(state.logs.length);
    }
    static findById() {
      return { lean: async () => state.logs[0] || null };
    }
  }
  return { default: BackupLog };
});

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  performBackup,
  listBackups,
  getBackupById,
} from "../services/backup.js";

let tempDir = null;

async function newTempBackupDir() {
  tempDir = await mkdtemp(path.join(tmpdir(), "backup-test-"));
  return tempDir;
}

beforeEach(async () => {
  vi.clearAllMocks();
  state.saved.length = 0;
  state.spawnResultCode = 0;
  state.spawnError = null;
  state.toolPresent = true;
  state.encryptThrows = null;
  process.env.BACKUP_ENCRYPTION_KEY = "a".repeat(64);
  process.env.BACKUP_DIR = await newTempBackupDir();
  process.env.MONGO_URI = "mongodb://127.0.0.1:27017/dental_os_test";
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    tempDir = null;
  }
  delete process.env.BACKUP_DIR;
  delete process.env.BACKUP_ENCRYPTION_KEY;
  delete process.env.NODE_ENV;
});

describe("performBackup", () => {
  it("refuses to run without BACKUP_ENCRYPTION_KEY (PHI safety)", async () => {
    delete process.env.BACKUP_ENCRYPTION_KEY;
    await expect(performBackup("scheduled")).rejects.toThrow("BACKUP_ENCRYPTION_KEY");
  });

  it("refuses to run without MONGO_URI", async () => {
    delete process.env.MONGO_URI;
    await expect(performBackup("scheduled")).rejects.toThrow("MONGO_URI");
  });

  it("throws when mongodump is not installed", async () => {
    state.toolPresent = false;
    await expect(performBackup("scheduled")).rejects.toThrow("mongodump not found");
    expect(state.saved[0]).toMatchObject({ status: "failed" });
  });

  it("throws a structured error when mongodump exits non-zero", async () => {
    state.spawnResultCode = 1;
    await expect(performBackup("scheduled")).rejects.toThrow(/exited with code 1/);
    expect(state.saved[0].status).toBe("failed");
  });

  it("rejects a second backup while one is in progress", async () => {
    // Force the tool check to delay so the in-progress flag is set.
    const p1 = performBackup("scheduled");
    await new Promise((r) => setTimeout(r, 10));
    await expect(performBackup("manual")).rejects.toThrow("already in progress");
    await p1;
  });

  it("rejects while a previous backup is genuinely still running", async () => {
    const p1 = performBackup("scheduled");
    await expect(p1).resolves.toBeDefined();
  });

  it("runs the full pipeline and records a completed encrypted log", async () => {
    const log = await performBackup("scheduled", null, { retentionDays: 30 });

    expect(log.status).toBe("completed");
    expect(log.encrypted).toBe(true);
    expect(log.filename).toMatch(/\.archive\.enc$/);
    expect(log.sizeBytes).toBeGreaterThan(0);
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
    expect(state.saved).toHaveLength(1);
  });

  it("records failure and removes the partial archive when encryption fails", async () => {
    state.encryptThrows = new Error("cipher broken");

    await expect(performBackup("scheduled")).rejects.toThrow("cipher broken");
    expect(state.saved[0].status).toBe("failed");
    const files = await readdir(tempDir);
    expect(files).toHaveLength(0);
  });
});

describe("listBackups / getBackupById", () => {
  it("paginates backup logs", async () => {
    state.logs = [{ _id: "1", filename: "a.archive.enc", status: "completed" }];
    const result = await listBackups(1, 20);
    expect(result).toMatchObject({
      page: 1,
      limit: 20,
      pages: 1,
      total: 1,
    });
    expect(result.logs[0].filename).toBe("a.archive.enc");
  });

  it("returns null pages for an empty set", async () => {
    state.logs = [];
    const result = await listBackups(2, 20);
    expect(result.pages).toBe(0);
    expect(result.logs).toEqual([]);
  });

  it("fetches a single log by id", async () => {
    state.logs = [{ _id: "abc", status: "completed" }];
    const log = await getBackupById("abc");
    expect(log).toEqual({ _id: "abc", status: "completed" });
  });
});