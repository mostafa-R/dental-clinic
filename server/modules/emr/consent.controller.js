import mongoose from 'mongoose';

import Consent from './consent.model.js';
import {
  computeSignatureHash,
  generateOtpCode,
  hashOtpCode,
  isSignatureValid,
  OTP_TTL_SECONDS,
} from './consent.service.js';
import { cacheDel, cacheGet, cacheSet } from '../../utils/cache.js';
import { sendWhatsAppMessage } from '../../services/whatsapp.js';
import { emitToBranch } from '../../socket/index.js';
import { publishEvent } from '../../services/eventBus.js';
import ApiError from '../../utils/ApiError.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { loadScopedPatient, toObjectId } from '../../utils/branchScope.js';
import { sendSuccess } from '../../utils/sendSuccess.js';
import { stripPHI } from '../../middleware/phiRestrict.js';

const POPULATE = [
  { path: 'patient', select: 'patientId firstName lastName phone' },
  { path: 'treatmentPlan', select: 'planNo title status' },
  { path: 'createdBy', select: 'name' },
  { path: 'updatedBy', select: 'name' },
  { path: 'signature.signedBy', select: 'name' },
];

/**
 * Load a consent scoped to a patient + the caller's branch. The patient was
 * already validated by `loadScopedPatient`, so the consent is matched against
 * the patient id and branch. When `populate` is false the raw document is
 * returned (used by signature verification, which must see the un-populated
 * ObjectId refs).
 */
async function loadConsent(patient, consentId, { populate = true } = {}) {
  if (!mongoose.isValidObjectId(consentId)) {
    throw ApiError.badRequest('Invalid consent id');
  }
  const query = Consent.findOne({ _id: consentId, patient: patient._id, branch: patient.branch, isActive: true });
  return populate ? query.populate(POPULATE) : query;
}

/** Auto-increment the version per (patient, type): next = max active + 1. */
async function nextVersion(patientId, type) {
  const latest = await Consent.findOne({ patient: patientId, type, isActive: true })
    .sort({ version: -1 })
    .select('version')
    .lean();
  return (latest?.version || 0) + 1;
}

function serialize(consent, req) {
  return req.isImpersonation ? stripPHI(consent.toJSON()) : consent;
}

function emitConsent(branchId, event, consent, req) {
  const plain = consent && typeof consent.toJSON === 'function' ? consent.toJSON() : consent;
  emitToBranch(branchId, event, { consent: req.isImpersonation ? stripPHI(plain) : plain });
}

export const listConsents = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const { page, limit, status, type } = req.validatedQuery;

  const filter = { patient: patient._id, branch: patient.branch, isActive: true };
  if (status) filter.status = status;
  if (type) filter.type = type;

  const skip = (page - 1) * limit;
  const [consents, total] = await Promise.all([
    Consent.find(filter).populate(POPULATE).sort('-createdAt').skip(skip).limit(limit),
    Consent.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    consents: req.isImpersonation ? consents.map((c) => stripPHI(c.toJSON())) : consents,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId);
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }
  return sendSuccess(res, { consent: serialize(consent, req) });
});

export const createConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const data = req.validatedBody;
  const tenant = patient.tenant;

  // L1: `nextVersion` (max active version + 1) is vulnerable to a read-then-
  // write race on concurrent creates for the same (patient, type) — the unique
  // index would throw E11000 and surface as a 500. Retry with a fresh version
  // a few times; persistent contention is a genuine conflict → 409.
  const MAX_RETRIES = 3;
  let consent;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      consent = await Consent.create({
        branch: patient.branch,
        tenant,
        patient: patient._id,
        type: data.type,
        title: data.title,
        summary: data.summary || '',
        termsText: data.termsText || '',
        treatmentPlan: data.treatmentPlan ? toObjectId(data.treatmentPlan) : null,
        attachmentUrl: data.attachmentUrl || '',
        version: await nextVersion(patient._id, data.type),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        status: 'draft',
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      break;
    } catch (err) {
      const isDupKey =
        err?.code === 11000 ||
        (err?.name === 'MongoServerError' && /E11000|duplicate key/i.test(err?.message || ''));
      if (!isDupKey) throw err;
    }
  }
  if (!consent) {
    throw ApiError.conflict(
      'A newer version of this consent was created at the same time — please retry',
    );
  }

  await consent.populate(POPULATE);
  emitConsent(patient.branch, 'consent:created', consent, req);

  return sendSuccess(res, { consent: serialize(consent, req) }, 201);
});

export const updateConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId);
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }

  if (!['draft', 'sent'].includes(consent.status)) {
    throw ApiError.conflict('Once a consent is signed, declined or withdrawn, its content cannot be changed');
  }

  const data = req.validatedBody;
  if (data.title !== undefined) consent.title = data.title;
  if (data.summary !== undefined) consent.summary = data.summary;
  if (data.termsText !== undefined) consent.termsText = data.termsText;
  if (data.treatmentPlan !== undefined) {
    consent.treatmentPlan = data.treatmentPlan ? toObjectId(data.treatmentPlan) : null;
  }
  if (data.attachmentUrl !== undefined) consent.attachmentUrl = data.attachmentUrl;
  if (data.expiresAt !== undefined) consent.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (data.status !== undefined) consent.status = data.status;
  consent.updatedBy = req.user._id;

  await consent.save();
  await consent.populate(POPULATE);
  emitConsent(patient.branch, 'consent:updated', consent, req);

  return sendSuccess(res, { consent: serialize(consent, req) });
});

/**
 * Deliver a 6-digit verification code to the patient's phone on file so an
 * `otp` signature can carry real proof of identity (audit M2). The code is
 * stored ONLY as an HMAC in Redis, single-use, 10-minute TTL, bound to this
 * consent + patient pair; the plaintext never leaves the outgoing message.
 * Using the phone ON FILE (not a caller-supplied number) is deliberate: the
 * code must reach the actual patient, not a phone the signer picks.
 */
export const sendConsentOtp = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId);
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }
  if (!['draft', 'sent'].includes(consent.status)) {
    throw ApiError.conflict('Only drafts or sent consents can be signed');
  }
  if (consent.expiresAt && new Date() > new Date(consent.expiresAt)) {
    throw ApiError.conflict('This consent has expired — please create a new version');
  }

  const phone = String(patient.phone || '').trim();
  if (!phone) {
    throw ApiError.badRequest('This patient has no phone number on file — add one before using OTP signatures');
  }

  const identity = `${consent._id}:${patient._id}`;
  const code = generateOtpCode();
  try {
    await cacheSet('consent-otp', identity, { hash: hashOtpCode(code, identity) }, OTP_TTL_SECONDS);
    await sendWhatsAppMessage(String(consent.tenant), phone, [
      'تأكيد موافقة طبية 🦷',
      '',
      `رمز التحقق الخاص بك: ${code}`,
      'صالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أي شخص.',
    ].join('\n'));
  } catch (err) {
    // A code that was never delivered must never be verifiable: consume it.
    await cacheDel('consent-otp', identity).catch(() => {});
    throw ApiError.conflict(
      `Could not deliver the verification code: ${err.message || 'WhatsApp not connected'}`,
    );
  }

  // Return a masked number only — the staff member already sees the patient's
  // contact info, but never the code.
  const masked = `***${phone.slice(-3)}`;
  return sendSuccess(res, {
    otp: { expiresInSeconds: OTP_TTL_SECONDS, sentTo: masked },
  });
});

/**
 * Sign the consent with the patient's electronic signature. Freezes the record
 * and publishes the `consent.signed` event so automation rules can react.
 */
export const signConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId);
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }

  if (!['draft', 'sent'].includes(consent.status)) {
    throw ApiError.conflict('Only drafts or sent consents can be signed');
  }

  // M6: a consent that reached its expiry date (or was auto-expired by the
  // cron) can no longer be signed — the patient must be issued a new version.
  if (consent.expiresAt && new Date() > new Date(consent.expiresAt)) {
    throw ApiError.conflict('This consent has expired — please create a new version');
  }

  const { signature, patientStatement, otp } = req.validatedBody;
  const signedAt = new Date();
  const name = signature.name.trim();

  // Audit M2: an `otp` signature must stand on a REAL verified code. The stamp
  // is wiped from Redis regardless of outcome (single-use), so every code can
  // be attempted exactly once.
  let otpVerifiedAt = null;
  if (signature.method === 'otp') {
    const identity = `${consent._id}:${patient._id}`;
    const pending = await cacheGet('consent-otp', identity);
    if (!pending || !pending.hash) {
      throw ApiError.badRequest('No active verification code — request one via send-otp first');
    }
    await cacheDel('consent-otp', identity).catch(() => {});
    const candidate = hashOtpCode(String(otp), identity);
    if (candidate !== pending.hash) {
      throw ApiError.conflict('Invalid verification code');
    }
    // The code was delivered to the phone on file; the signature must claim
    // the same number, not phone entered by the signer.
    if (signature.phone && signature.phone.trim() !== String(patient.phone || '').trim()) {
      throw ApiError.conflict(
        `The code was sent to the phone on file (***${String(patient.phone || '').slice(-3)})`,
      );
    }
    otpVerifiedAt = new Date();
  }

  consent.status = 'signed';
  // M4: summary (drafted by staff) stays immutable once shown — the patient's
  // own words are stored separately so staff edits can never invalidate the
  // signature or misrepresent what the patient actually agreed to.
  if (patientStatement !== undefined && patientStatement !== '') {
    consent.patientStatement = patientStatement;
  }
  consent.signature = {
    method: signature.method,
    name,
    phone: signature.phone || '',
    imageUrl: signature.imageUrl || '',
    ip: req.ip || req.socket?.remoteAddress || '',
    signedAt,
    signedBy: req.user._id,
    // Audit M2: stamp the successful code verification (otp method only) and
    // bind it into the HMAC below, so the "OTP-verified" claim is tamper-aware.
    ...(otpVerifiedAt ? { otpVerifiedAt } : {}),
    hash: computeSignatureHash(
      {
        // Use the raw patient id — after populate this field is a ref/doc and
        // its String() shape would diverge from the stored ObjectId.
        patient: patient._id,
        type: consent.type,
        title: consent.title,
        version: consent.version,
        termsText: consent.termsText,
        summary: consent.summary,
        patientStatement: consent.patientStatement,
        treatmentPlan: consent.treatmentPlan,
        attachmentUrl: consent.attachmentUrl,
        expiresAt: consent.expiresAt,
        otpVerifiedAt,
      },
      signedAt,
      name,
    ),
  };
  consent.updatedBy = req.user._id;

  await consent.save();
  await consent.populate(POPULATE);
  emitConsent(patient.branch, 'consent:signed', consent, req);

  await publishEvent({
    type: 'consent.signed',
    tenant: consent.tenant,
    branch: consent.branch,
    data: {
      consentId: String(consent._id),
      patientId: String(consent.patient),
      patient: patient.toJSON ? patient.toJSON() : patient,
      type: consent.type,
      title: consent.title,
      version: consent.version,
      treatmentPlan: consent.treatmentPlan ? String(consent.treatmentPlan) : null,
      signedAt,
    },
  });

  return sendSuccess(res, { consent: serialize(consent, req) });
});

export const declineConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId);
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }

  if (!['draft', 'sent'].includes(consent.status)) {
    throw ApiError.conflict('This consent is no longer awaiting a decision');
  }

  consent.status = 'declined';
  consent.declineReason = req.validatedBody.reason;
  consent.updatedBy = req.user._id;
  await consent.save();
  await consent.populate(POPULATE);
  emitConsent(patient.branch, 'consent:declined', consent, req);

  return sendSuccess(res, { consent: serialize(consent, req) });
});

/**
 * Withdraw a previously signed consent (patient revokes consent). The record
 * is preserved for the audit trail — only its status changes.
 */
export const withdrawConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId);
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }

  if (consent.status !== 'signed') {
    throw ApiError.conflict('Only signed consents can be withdrawn');
  }

  consent.status = 'withdrawn';
  consent.withdrawReason = req.validatedBody.reason;
  consent.updatedBy = req.user._id;
  await consent.save();
  await consent.populate(POPULATE);
  emitConsent(patient.branch, 'consent:withdrawn', consent, req);

  return sendSuccess(res, { consent: serialize(consent, req) });
});

/**
 * Tamper-evidence check: recompute the stored signature hash.
 */
export const verifyConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId, { populate: false });
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }

  const valid = isSignatureValid(consent);
  const sig = consent.signature || {};
  // The signer name is the patient or their legal guardian, so it is PHI. It
  // is not in PHI_FIELDS (`name` is also used for non-PHI staff references),
  // so stripPHI cannot remove it — it has to be omitted explicitly. This
  // handler is the only consent path that builds a raw literal rather than
  // going through `serialize()`, which is how the name slipped through.
  return sendSuccess(res, {
    verified: valid,
    signed: consent.status === 'signed',
    signedAt: sig.signedAt || null,
    ...(req.isImpersonation ? {} : { signerName: sig.name || '' }),
    method: sig.method || '',
    type: consent.type,
    version: consent.version,
  });
});

export const deleteConsent = asyncHandler(async (req, res) => {
  const patient = await loadScopedPatient(req, req.params.patientId);
  const consent = await loadConsent(patient, req.params.consentId);
  if (!consent) {
    throw ApiError.notFound('Consent not found');
  }

  if (!['draft', 'sent'].includes(consent.status)) {
    throw ApiError.conflict('Signed consent records cannot be deleted — withdraw them instead');
  }

  consent.isActive = false;
  consent.updatedBy = req.user._id;
  await consent.save();
  emitConsent(patient.branch, 'consent:deleted', { _id: consent._id }, req);

  return sendSuccess(res, { message: 'Consent deleted' });
});