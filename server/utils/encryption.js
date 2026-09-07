import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LENGTH);
}

function getPassword(provided) {
  const key = provided || process.env.BACKUP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('BACKUP_ENCRYPTION_KEY is required for file/backup encryption. Set it in .env — do NOT reuse JWT_SECRET.');
  }
  return key;
}

/**
 * Encrypt a file using AES-256-GCM.
 * Output format: [ENC1][salt(16)][iv(16)][authTag(16)][encrypted data]
 *
 * True streaming: the plaintext is piped through the cipher into a temp file
 * (constant memory — a 50MB upload never sits in RAM). GCM's auth tag is only
 * known after the last byte, so the ciphertext is staged in a temp dir and the
 * final file is assembled header-first ([ENC1][salt][iv][authTag][data]) to
 * stay byte-compatible with the pre-existing format and decryptFile.
 */
export async function encryptFile(inputPath, outputPath, password) {
  const secret = getPassword(password);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const tempDir = await mkdtemp(join(tmpdir(), 'encaes-'));
  const cipherPath = join(tempDir, 'payload.bin');

  try {
    await new Promise((resolve, reject) => {
      const inputStream = createReadStream(inputPath);
      const cipherStream = createWriteStream(cipherPath);
      inputStream.on('error', reject);
      cipherStream.on('error', reject);
      cipherStream.on('finish', resolve);
      inputStream.pipe(cipher).pipe(cipherStream);
    });

    const authTag = cipher.getAuthTag();

    await new Promise((resolve, reject) => {
      const payloadStream = createReadStream(cipherPath);
      const outputStream = createWriteStream(outputPath);
      outputStream.write(Buffer.from('ENC1', 'ascii'));
      outputStream.write(salt);
      outputStream.write(iv);
      outputStream.write(authTag);
      payloadStream.on('error', reject);
      outputStream.on('error', reject);
      outputStream.on('finish', resolve);
      payloadStream.pipe(outputStream, { end: true });
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Decrypt a file encrypted with encryptFile.
 * Input format: [salt(16)][iv(16)][authTag(16)][encrypted data]
 * @param {string} password - Optional explicit key. Defaults to the shared
 *   BACKUP_ENCRYPTION_KEY.
 */
export async function decryptFile(inputPath, outputPath, password) {
  const secret = getPassword(password);
  
  return new Promise((resolve, reject) => {
    const inputStream = createReadStream(inputPath);
    const outputStream = createWriteStream(outputPath);

    let salt = Buffer.alloc(0);
    let iv = Buffer.alloc(0);
    let authTag = Buffer.alloc(0);
    let headerParsed = false;
    let headerBuffer = Buffer.alloc(0);

    const MAGIC_SIZE = 4; // "ENC1"
    const HEADER_SIZE = MAGIC_SIZE + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;

    inputStream.on('data', (chunk) => {
      if (!headerParsed) {
        headerBuffer = Buffer.concat([headerBuffer, chunk]);
        if (headerBuffer.length >= HEADER_SIZE) {
          salt = headerBuffer.subarray(MAGIC_SIZE, MAGIC_SIZE + SALT_LENGTH);
          iv = headerBuffer.subarray(MAGIC_SIZE + SALT_LENGTH, MAGIC_SIZE + SALT_LENGTH + IV_LENGTH);
          authTag = headerBuffer.subarray(MAGIC_SIZE + SALT_LENGTH + IV_LENGTH, HEADER_SIZE);

          const key = deriveKey(secret, salt);
          const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
          decipher.setAuthTag(authTag);

          decipher.on('error', (err) => {
            outputStream.destroy(err);
            reject(err);
          });

          const remaining = headerBuffer.subarray(HEADER_SIZE);
          if (remaining.length > 0) decipher.write(remaining);

          inputStream.pipe(decipher);
          decipher.pipe(outputStream);

          outputStream.on('finish', resolve);
          headerParsed = true;
        }
      }
    });

    inputStream.on('error', reject);
    outputStream.on('error', reject);
  });
}

/**
 * Check if a file starts with a valid encryption header.
 * Uses a magic prefix "ENC1" to distinguish from plain files.
 */
export function isEncrypted(buffer) {
  if (buffer.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH + 4) return false;
  return buffer.subarray(0, 4).toString('ascii') === 'ENC1';
}

/**
 * Decrypt a file trying each candidate key string in order. AES-256-GCM auth
 * tags fail on the wrong key, so a rejected attempt means "wrong key". Used by
 * attachments: files written after per-tenant keys exist decrypt with the
 * tenant key; legacy files fall back to the shared BACKUP_ENCRYPTION_KEY.
 *
 * Returns true when a key succeeds; throws the last error when none match.
 */
export async function decryptFileWithKeys(inputPath, outputPath, passwords = []) {
  const candidates = Array.from(new Set(passwords.filter(Boolean)));
  const envKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (envKey && !candidates.includes(envKey)) {
    candidates.push(envKey);
  }

  let lastError = null;
  for (const pw of candidates) {
    try {
      await decryptFile(inputPath, outputPath, pw);
      return true;
    } catch (err) {
      lastError = err;
      await unlink(outputPath).catch(() => {});
    }
  }

  throw lastError;
}
