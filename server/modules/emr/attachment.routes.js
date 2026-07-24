import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { uploadMedicalFile } from '../../middleware/upload.js';
import { encryptFile, decryptFile, isEncrypted } from '../../utils/encryption.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { unlink, access, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'medical');
const ENCRYPTED_SUFFIX = '.enc';

const router = Router();

router.post(
  '/upload',
  protect,
  checkPermission('emr', 'create'),
  uploadMedicalFile.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No file uploaded');
    }

    const originalPath = req.file.path;
    const encryptedPath = originalPath + ENCRYPTED_SUFFIX;

    try {
      await encryptFile(originalPath, encryptedPath);
      await unlink(originalPath);

      return sendSuccess(res, {
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          url: `/api/v1/emr/attachments/${req.file.filename}/download`,
          encryptedFilename: path.basename(encryptedPath),
          uploadedBy: req.user._id,
          uploadedAt: new Date().toISOString(),
        },
      }, 201);
    } catch (encryptErr) {
      await unlink(originalPath).catch(() => {});
      await unlink(encryptedPath).catch(() => {});
      throw encryptErr;
    }
  }),
);

router.get(
  '/:filename/download',
  protect,
  checkPermission('emr', 'read'),
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const safeName = path.basename(filename);
    const encryptedPath = path.join(UPLOADS_DIR, safeName + ENCRYPTED_SUFFIX);
    const plainPath = path.join(UPLOADS_DIR, safeName);
    const tmpPath = path.join(UPLOADS_DIR, `.tmp_${crypto.randomUUID()}_${safeName}`);

    let fileExists = false;
    try {
      await access(encryptedPath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (!fileExists) {
      try {
        await access(plainPath);
        fileExists = true;
      } catch {
        fileExists = false;
      }
    }

    if (!fileExists) {
      throw ApiError.notFound('File not found');
    }

    const isPlainFile = await (async () => {
      try {
        const buf = await readFile(encryptedPath);
        return !isEncrypted(buf);
      } catch {
        return true;
      }
    })();

    if (isPlainFile) {
      return res.sendFile(plainPath);
    }

    try {
      await decryptFile(encryptedPath, tmpPath);

      const ext = path.extname(safeName).toLowerCase();
      const mimeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.pdf': 'application/pdf',
      };
      const contentType = mimeMap[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);

      const stream = createReadStream(tmpPath);
      stream.pipe(res);
      stream.on('end', async () => {
        await unlink(tmpPath).catch(() => {});
      });
      stream.on('error', async () => {
        await unlink(tmpPath).catch(() => {});
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Failed to stream file' });
        }
      });
    } catch (decryptErr) {
      await unlink(tmpPath).catch(() => {});
      throw ApiError.internal('Failed to decrypt file');
    }
  }),
);

export default router;
