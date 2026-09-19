import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Only the mongodump PROCESS is faked. Encryption/decryption and the file
// pipeline run for real (utils/encryption.js is NOT mocked), so this test
// proves the on-disk encrypted archive can actually be restored.
const state = vi.hoisted(() => ({
  archiveContent: Buffer.from("mongodump-archive-bytes-\u0000\u0001\u0002-PHI"),
  spawnError: null,
  exitCode: 0,
  caught: null,
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn((bin, args) => {
    const archiveArg = args.find((a) => a.startsWith("--archive="));
    const archivePath = archiveArg ? archiveArg.slice("--archive=".length) : null;
    const handlers = {};
    const proc = {
      stderr: { on: (ev, cb) => { handlers.stderr = cb; } },
      on: (ev, cb) => {
        handlers[ev] = cb;
        if (ev === "close" || ev === "error") {
          setImmediate(async () => {
            try {
              if (state.spawnError) return handlers.error(state.spawnError);
              if (archivePath && state.exitCode === 0) {
                await writeFile(archivePath, state.archiveContent);
              }
              handlers.close(state.exitCode);
            } catch (err) {
              state.caught = err;
              handlers.error(err);
            }
          });
        }
      },
    };
    return proc;
  }),
  execSync: vi.fn(() => ""),
}));

vi.mock("../modules/site/backup/backupLog.model.js", () => {
  class BackupLog {
    constructor(data = {}) {
      Object.assign(this, { status: "running", encrypted: false }, data);
    }
    save = vi.fn(async () => this);
    static create = vi.fn(async (data) => new BackupLog(data));
    static find = () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [] }) }) }) });
    static countDocuments = async () => 0;
    static findById = () => ({ lean: async () => null });
  }
  return { default: BackupLog };
});

import { performBackup } from "../services/backup.js";
import { decryptFile } from "../utils/encryption.js";

let backupDir = null;

beforeEach(async () => {
  vi.clearAllMocks();
  state.spawnError = null;
  state.exitCode = 0;
  state.caught = null;
  process.env.BACKUP_ENCRYPTION_KEY = "integration-test-key-material-".repeat(2);
  process.env.MONGO_URI = "mongodb://127.0.0.1:27017/dental_os_backup_it";
  backupDir = await mkdtemp(path.join(tmpdir(), "backup-int-"));
  process.env.BACKUP_DIR = backupDir;
});

afterEach(async () => {
  if (backupDir) {
    await rm(backupDir, { recursive: true, force: true }).catch(() => {});
    backupDir = null;
  }
  delete process.env.BACKUP_DIR;
});

describe("performBackup — real encryption round-trip (restore-ready)", () => {
  it("writes an ENC1 archive that decrypts back to the exact dump bytes", async () => {
    const log = await performBackup("manual", "admin1", { retentionDays: 30 });

    expect(log.status).toBe("completed");
    expect(log.encrypted).toBe(true);
    expect(log.filename).toMatch(/\.archive\.enc$/);

    const files = await readdir(backupDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.archive\.enc$/);

    const encPath = path.join(backupDir, files[0]);
    const header = await readFile(encPath);
    expect(header.subarray(0, 4).toString("ascii")).toBe("ENC1");

    const outPath = path.join(backupDir, "restored.archive");
    await decryptFile(encPath, outPath);
    const restored = await readFile(outPath);
    expect(restored.equals(state.archiveContent)).toBe(true);
  });

  it("never leaves a cleartext .archive behind", async () => {
    await performBackup("scheduled");
    const files = await readdir(backupDir);
    expect(files.some((f) => f.endsWith(".archive"))).toBe(false);
  });

  it("marks the log failed and removes partial output when mongodump errors", async () => {
    state.exitCode = 1;
    await expect(performBackup("scheduled")).rejects.toThrow(/exited with code 1/);
    const files = await readdir(backupDir);
    expect(files).toHaveLength(0);
  });
});