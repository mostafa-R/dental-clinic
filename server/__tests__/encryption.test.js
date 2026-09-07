/**
 * Encryption streaming tests (M1).
 *
 * encryptFile streams the plaintext through the cipher into a temp staging
 * file (constant memory) and assembles the final [ENC1][salt][iv][authTag]
 * header — the output must stay byte-compatible with decryptFile and decrypt
 * cleanly, on both real files and a multi-MB input.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";
import { encryptFile, decryptFile, decryptFileWithKeys, isEncrypted } from "../utils/encryption.js";

process.env.BACKUP_ENCRYPTION_KEY = "test-key-for-encryption-suite";

let tempDir;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "enc-test-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("encryptFile — streaming roundtrip", () => {
  it("encrypts and decrypts a file to the original bytes", async () => {
    const plaintext = Buffer.from("sample medical record payload 🦷");
    const inputPath = join(tempDir, "plain.txt");
    const encPath = join(tempDir, "plain.txt.enc");
    const outPath = join(tempDir, "decrypted.txt");

    await writeFile(inputPath, plaintext);
    await encryptFile(inputPath, encPath, "explicit-key");

    // Header magic is present for isEncrypted() consumers.
    const header = await readFile(encPath);
    expect(isEncrypted(header)).toBe(true);

    await decryptFile(encPath, outPath, "explicit-key");
    const restored = await readFile(outPath);
    expect(restored).toEqual(plaintext);
  });

  it("round-trips a payload larger than one stream chunk", async () => {
    const size = 512 * 1024; // 512KB spans multiple 64KB stream chunks
    const big = crypto.randomBytes(size);
    const inputPath = join(tempDir, "big.bin");
    const encPath = join(tempDir, "big.bin.enc");
    const outPath = join(tempDir, "big.out");

    await writeFile(inputPath, big);
    await encryptFile(inputPath, encPath);

    // The encrypt output must not be larger than input + header (48 bytes)
    // — proof it did not accidentally re-buffer a double copy.
    const encSize = (await stat(encPath)).size;
    expect(encSize).toBe(size + 4 + 16 + 16 + 16);

    await decryptFile(encPath, outPath);
    const restored = await readFile(outPath);
    expect(restored).toEqual(big);
  });

  it("rejects tampered ciphertext (GCM auth tag)", async () => {
    const inputPath = join(tempDir, "tamper-in.txt");
    const encPath = join(tempDir, "tamper.enc");
    const outPath = join(tempDir, "tamper-out.txt");

    await writeFile(inputPath, Buffer.from("integrity check"));
    await encryptFile(inputPath, encPath, "k");

    const buf = await readFile(encPath);
    buf[10] ^= 0xff; // flip a byte in the ciphertext region
    await writeFile(encPath, buf);

    await expect(decryptFile(encPath, outPath, "k")).rejects.toThrow();
  });

  it("fails with a wrong key and succeeds via decryptFileWithKeys fallback", async () => {
    const inputPath = join(tempDir, "fallback-in.txt");
    const encPath = join(tempDir, "fallback.enc");
    const outPath = join(tempDir, "fallback-out.txt");

    await writeFile(inputPath, Buffer.from("legacy attachment"));
    await encryptFile(inputPath, encPath, "tenant-key");

    await expect(decryptFile(encPath, outPath, "wrong-key")).rejects.toThrow();

    await decryptFileWithKeys(encPath, outPath, ["tenant-key"]);
    const restored = await readFile(outPath);
    expect(restored.toString()).toBe("legacy attachment");
  });
});