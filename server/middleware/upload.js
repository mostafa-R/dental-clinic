import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads', 'medical');
mkdirSync(UPLOADS_ROOT, { recursive: true });

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/dicom', // DICOM X-ray
]);

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

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
