import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'medical');
mkdirSync(UPLOADS_ROOT, { recursive: true });

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/dicom', // DICOM X-ray
]);

const MAX_SIZE = 50 * 1024 * 1024; // PRD §6.5: max 50 MB

/**
 * Magic-byte signatures for every allowed type. The client-supplied mimetype
 * is never trusted on its own — an attacker can upload a polyglot (or a file
 * renamed to .png) and the stored record would lie about it.
 */
const MAGIC_BYTES = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/webp': [
    { offset: 0, match: 'RIFF' },
    { offset: 8, match: 'WEBP' },
  ],
  'image/gif': [
    // GIF87a / GIF89a
    { offset: 0, match: 'GIF87a' },
    { offset: 0, match: 'GIF89a' },
  ],
  'application/pdf': [{ offset: 0, match: '%PDF' }],
  // DICOM stores "DICM" at byte offset 128.
  'application/dicom': [{ offset: 128, match: 'DICM' }],
};

/**
 * Sniff `filePath`'s header and confirm it matches the claimed mimetype.
 * Throws a 400 ApiError on mismatch. Reads at most 132 bytes (DICOM probe).
 */
export async function assertFileSignature(filePath, mimetype, ApiError) {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) {
    throw ApiError.badRequest(`Cannot verify file type ${mimetype}`);
  }

  const probeLen = Math.max(132, ...signatures.map((s) => s.offset + s.bytes.length));
  const handle = await open(filePath, 'r');
  let buffer;
  try {
    const { buffer: buf, bytesRead } = await handle.read(Buffer.alloc(probeLen), 0, probeLen, 0);
    buffer = buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  const matches = signatures.some((sig) => {
    if (sig.bytes) {
      if (buffer.length < sig.offset + sig.bytes.length) return false;
      return sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
    }
    if (sig.match) {
      if (buffer.length < sig.offset + sig.match.length) return false;
      return buffer.toString('latin1', sig.offset, sig.offset + sig.match.length) === sig.match;
    }
    return false;
  });

  if (!matches) {
    throw ApiError.badRequest(`File content does not match type ${mimetype}`);
  }
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOADS_ROOT);
  },
  filename(_req, file, cb) {
    const unique = crypto.randomUUID();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`File type ${file.mimetype} is not allowed`), { statusCode: 400 }), false);
  }
}

export const uploadMedicalFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});
