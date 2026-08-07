import path from 'node:path';
import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { uploadMedicalFile, UPLOADS_ROOT } from '../../middleware/upload.js';
import { encryptFile, decryptFile, isEncrypted } from '../../utils/encryption.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { unlink, access, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import MedicalAttachment from './attachment.model.js';
import { ATTACHMENT_TYPES } from '../../constants/dental.js';
import { loadScopedPatient, toObjectId } from '../../utils/branchScope.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';

const ENCRYPTED_SUFFIX = '.enc';

const router = Router();

/**
 * Build a Mongo filter that restricts an attachment to the authenticated
 * user's tenant/branch. Mirrors `filterByBranch` semantics so downloads are
 * scoped the same way as the rest of the EMR: a user can only ever fetch
 * files that belong to a patient in their own branch (and tenant).
 */
function attachmentScope(req) {
  const isSystemAdmin = req._roleResolved?.isSystemAdmin;
  if (isSystemAdmin) {
    if (req.user.tenant) return { tenant: toObjectId(req.user.tenant) };
    return {};
  }

  if (!req.user.branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  const filter = { branch: toObjectId(req.user.branch) };
  if (req.user.tenant) filter.tenant = toObjectId(req.user.tenant);
  return filter;
}

router.post(
  '/upload',
  protect,
  checkPermission('emr', 'create'),
  phiRestrict,
  uploadMedicalFile.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No file uploaded');
    }

    // The file is bound to a patient, which pins branch + tenant ownership.
    const patient = await loadScopedPatient(req, req.body.patient);

    const { type, caption } = req.body;
    if (type && !ATTACHMENT_TYPES.includes(type)) {
      throw ApiError.badRequest('Invalid attachment type');
    }

    const originalPath = req.file.path;
    const encryptedPath = originalPath + ENCRYPTED_SUFFIX;

    try {
      await encryptFile(originalPath, encryptedPath);
      await unlink(originalPath);

      const record = await MedicalAttachment.create({
        tenant: patient.tenant || null,
        branch: patient.branch,
        patient: patient._id,
        type: type || 'xray',
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        caption: caption || '',
        uploadedBy: req.user._id,
      });

      return sendSuccess(
        res,
        {
          file: {
            _id: record._id,
            filename: record.filename,
            originalName: record.originalName,
            mimeType: record.mimeType,
            size: record.size,
            type: record.type,
            caption: record.caption,
            patient: record.patient,
            branch: record.branch,
            url: `/api/v1/emr/attachments/${record.filename}/download`,
            encryptedFilename: path.basename(encryptedPath),
            uploadedBy: record.uploadedBy,
            uploadedAt: record.uploadedAt,
          },
        },
        201,
      );
    } catch (err) {
      await unlink(originalPath).catch(() => {});
      await unlink(encryptedPath).catch(() => {});
      throw err;
    }
  }),
);

router.get(
  '/:filename/download',
  protect,
  checkPermission('emr', 'read'),
  phiRestrict,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const safeName = path.basename(filename);

    // The file must be registered AND owned by the caller's scope. This
    // closes the blind-download hole: knowing a random filename is not
    // enough to fetch a file outside the caller's branch/tenant.
    const record = await MedicalAttachment.findOne({
      filename: safeName,
      isActive: true,
      ...attachmentScope(req),
    });
    if (!record) {
      throw ApiError.notFound('File not found');
    }

    const encryptedPath = path.join(UPLOADS_ROOT, safeName + ENCRYPTED_SUFFIX);
    const plainPath = path.join(UPLOADS_ROOT, safeName);
    const tmpPath = path.join(UPLOADS_ROOT, `.tmp_${crypto.randomUUID()}_${safeName}`);

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

router.delete(
  '/:filename',
  protect,
  checkPermission('emr', 'delete'),
  phiRestrict,
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const safeName = path.basename(filename);

    const record = await MedicalAttachment.findOne({
      filename: safeName,
      isActive: true,
      ...attachmentScope(req),
    });
    if (!record) {
      throw ApiError.notFound('File not found');
    }

    record.isActive = false;
    await record.save();

    await unlink(path.join(UPLOADS_ROOT, safeName + ENCRYPTED_SUFFIX)).catch(() => {});
    await unlink(path.join(UPLOADS_ROOT, safeName)).catch(() => {});

    return sendSuccess(res, { message: 'Attachment deleted' });
  }),
);

export default router;
