import path from 'node:path';
import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { uploadMedicalFile, assertFileSignature, UPLOADS_ROOT } from '../../middleware/upload.js';
import { encryptFile, decryptFileWithKeys } from '../../utils/encryption.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { unlink, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import MedicalAttachment from './attachment.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import { ATTACHMENT_TYPES } from '../../constants/dental.js';
import { loadScopedPatient, toObjectId } from '../../utils/branchScope.js';
import { phiRestrict } from '../../middleware/phiRestrict.js';
import { enforcePlanLimits } from '../../middleware/tenantRouter.js';

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
    // Audit H4: fail closed. A role that resolved to system-admin while
    // carrying no tenant used to fall through to `{}` — an unscoped filter
    // that made `findOne(filename)` readable for EVERY attachment in the
    // database. There is deliberately no "platform read" path for clinical
    // files: a tenant-less admin gets a filter that matches nothing.
    if (req.user.tenant) return { tenant: toObjectId(req.user.tenant) };
    return { _id: null };
  }

  if (!req.user.branch) {
    throw ApiError.forbidden('Your account is not assigned to a branch');
  }

  const filter = { branch: toObjectId(req.user.branch) };
  if (req.user.tenant) filter.tenant = toObjectId(req.user.tenant);
  return filter;
}

/**
 * Load the tenant's per-tenant encryption key (stored `select: false`).
 * Every clinic has its own key generated at creation, so one tenant's
 * ciphertext is never decryptable with another tenant's key.
 */
async function getTenantKey(tenantId) {
  if (!tenantId) return null;
  const tenant = await Tenant.findById(tenantId).select('+encryption.key').lean();
  return tenant?.encryption?.key || null;
}

/**
 * @swagger
 * /api/v1/emr/attachments/upload:
 *   post:
 *     tags: [EMR Attachments]
 *     summary: Upload a medical attachment
 *     description: "Requires `emr:create` and multipart/form-data. Files are encrypted at rest. Allowed types: image/jpeg, image/png, image/webp, image/gif, application/pdf, application/dicom. Max 50MB."
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [patient, file]
 *             properties:
 *               patient: { $ref: '#/components/schemas/ObjectId', description: 'Scoped to the caller''s branch' }
 *               file:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 enum: [xray, image, document, lab, other]
 *                 default: xray
 *               caption: { type: string, maxLength: 500 }
 *     responses:
 *       '201':
 *         description: Attachment uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     file: { $ref: '#/components/schemas/ClinicalNoteAttachment' }
 *       '400':
 *         description: No file uploaded, invalid type, or invalid patient
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  '/upload',
  protect,
  checkPermission('emr', 'create'),
  phiRestrict,
  // Storage plan cap: enforces tenant settings.storageLimit (MB) before the
  // file is written. Counts existing attachments' size sums; uploads that
  // would push the tenant over the cap are rejected with 403.
  enforcePlanLimits('storage'),
  uploadMedicalFile.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No file uploaded');
    }

    const originalPath = req.file.path;
    const encryptedPath = originalPath + ENCRYPTED_SUFFIX;

    // Audit H12: the whole handler runs inside one cleanup envelope. The old
    // code only removed the plaintext when encryption or the DB write failed —
    // a bad patient scope, a bad `type`, or a signature mismatch left the
    // freshly-written file (unencrypted PHI) orphaned on disk with no record.
    try {
      // The file is bound to a patient, which pins branch + tenant ownership.
      const patient = await loadScopedPatient(req, req.body.patient);

      const { type, caption } = req.body;
      if (type && !ATTACHMENT_TYPES.includes(type)) {
        throw ApiError.badRequest('Invalid attachment type');
      }

      // L4: verify the on-disk bytes match the declared mimetype — the
      // request's `file.mimetype` is client-controlled and cannot be trusted.
      await assertFileSignature(req.file.path, req.file.mimetype, ApiError);

      // Encrypt with the tenant's own key (never the shared backup key).
      // Patient data already pins tenant ownership, so `patient.tenant` is the
      // authoritative owner even for system admins.
      const tenantKey = await getTenantKey(patient.tenant);
      await encryptFile(originalPath, encryptedPath, tenantKey);
      // Remove the plaintext the moment the ciphertext exists — anything that
      // fails below must not leave it standing (H12).
      await unlink(originalPath).catch(() => {});

      const record = await MedicalAttachment.create({
        tenant: patient.tenant || null,
        branch: patient.branch,
        patient: patient._id,
        type: type || 'xray',
        filename: req.file.filename,
        encryptedFilename: path.basename(encryptedPath),
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
      // H12: all-or-nothing — no plaintext, no ciphertext, no orphan.
      await unlink(originalPath).catch(() => {});
      await unlink(encryptedPath).catch(() => {});
      throw err;
    }
  }),
);

/**
 * @swagger
 * /api/v1/emr/attachments/{filename}/download:
 *   get:
 *     tags: [EMR Attachments]
 *     summary: Download / preview a medical attachment
 *     description: "Requires `emr:read`. Streams the decrypted file inline. The file must be registered AND owned by the caller's tenant/branch - knowing a filename is not enough to fetch files outside the caller's scope."
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string, maxLength: 255 }
 *         description: Stored filename returned by the upload endpoint.
 *     responses:
 *       '200':
 *         description: File stream (image or PDF content type)
 *         content:
 *           image/jpeg:
 *             schema: { type: string, format: binary }
 *           image/png:
 *             schema: { type: string, format: binary }
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
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

    const accessible = async (p) => {
      try {
        await access(p);
        return true;
      } catch {
        return false;
      }
    };

    let hasEncrypted = await accessible(encryptedPath);
    const hasPlain = !hasEncrypted && (await accessible(plainPath));
    if (!hasEncrypted && !hasPlain) {
      throw ApiError.notFound('File not found');
    }

    // Audit H1/H11: the legacy path streamed a plaintext file straight off
    // disk, so every record written before per-tenant keys (or by any failure
    // of the old upload path) stayed decrypted forever. Migrate this record
    // NOW, in place: encrypt it under the tenant's key (or the shared
    // BACKUP_ENCRYPTION_KEY for tenant-less legacy data) and remove the
    // plaintext, then fall through to the normal decrypt-and-stream path.
    // Running the backfill script (`scripts/encrypt-legacy-attachments.js`)
    // makes the download path a no-op afterwards.
    if (!hasEncrypted) {
      const tenantKey = await getTenantKey(record.tenant);
      try {
        await encryptFile(plainPath, encryptedPath, tenantKey || undefined);
      } catch (err) {
        // Fail closed: silently serving plaintext is exactly the hole this
        // closes. (A missing BACKUP_ENCRYPTION_KEY is a boot-validation
        // problem in production, not something to paper over per request.)
        console.error(
          `[Attachments] Failed to encrypt legacy plaintext ${safeName}: ${err.message}`,
        );
        throw ApiError.internal('File is not encrypted and could not be migrated');
      }
      // Only delete the plaintext once the ciphertext exists and is intact.
      await unlink(plainPath).catch(() => {});
      hasEncrypted = true;
    }

    try {
      // Prefer the tenant's key; legacy files encrypted with the shared
      // BACKUP_ENCRYPTION_KEY still decrypt via the fallback inside
      // decryptFileWithKeys.
      const tenantKey = await getTenantKey(record.tenant);
      await decryptFileWithKeys(encryptedPath, tmpPath, tenantKey ? [tenantKey] : []);

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

/**
 * @swagger
 * /api/v1/emr/attachments/{filename}:
 *   delete:
 *     tags: [EMR Attachments]
 *     summary: Soft-delete a medical attachment
 *     description: "Requires `emr:delete`. Marks the record inactive and removes the encrypted file from disk. Only attachments within the caller's tenant/branch scope can be deleted."
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string, maxLength: 255 }
 *         description: Stored filename of the attachment.
 *     responses:
 *       '200':
 *         description: Attachment deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: 'Attachment deleted' }
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '404':
 *         $ref: '#/components/responses/NotFound'
 */
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
