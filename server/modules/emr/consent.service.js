import crypto from 'node:crypto';

/**
 * Local E-signature service (PRD §9.3 🟡: خدمة توقيع إلكتروني محلية).
 *
 * A signature is an HMAC-SHA256 over the immutable facts of the record, bound
 * to the moment of signing and the signer's typed name. The key derives from
 * `CONSENT_SIGNING_KEY` (or JWT_SECRET as fallback) — never exposed to the API.
 * This makes signed consents tamper-evident without a third-party provider.
 */
export function signingKey() {
  const key = process.env.CONSENT_SIGNING_KEY || process.env.JWT_SECRET;

  // A hardcoded fallback means anyone who has read the source can forge a
  // signature on a signed consent, and recomputing one is enough to defeat the
  // tamper check entirely. That is a correctness bug in development (records
  // signed under one key stop verifying after the env changes) and a legal
  // problem in production, so refuse to run rather than sign with a public key.
  // Local development keeps the old literal so the existing test suite and seed
  // data behave the same without extra setup.
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CONSENT_SIGNING_KEY (or JWT_SECRET) must be set to sign consents. ' +
          'Refusing to fall back to a built-in key, because that key is public.',
      );
    }
    return 'dev-only-consent-key';
  }

  return key;
}

/**
 * Compute the signature hash for a consent record at a given timestamp.
 *
 * Covers the immutable record facts (patient, type, title, version) AND the
 * content the patient agreed to (termsText, summary, treatmentPlan,
 * attachmentUrl, expiresAt) plus the moment of signing and the signer name.
 * Post-signature edits to any of these fields therefore invalidate the hash.
 */
export function computeSignatureHash(consent, signedAt, name) {
  const ts = new Date(signedAt).toISOString();
  const payload = [
    String(consent.patient),
    consent.type,
    consent.title,
    String(consent.version),
    consent.termsText || '',
    consent.summary || '',
    consent.patientStatement || '',
    consent.treatmentPlan ? String(consent.treatmentPlan) : '',
    consent.attachmentUrl || '',
    consent.expiresAt ? new Date(consent.expiresAt).toISOString() : '',
    ts,
    String(name || ''),
  ];
  // Audit M2: bind the OTP-verification stamp into the HMAC — appended ONLY
  // when present, so records signed before the OTP flow existed (and all
  // non-OTP methods) hash to byte-identical payloads and keep verifying.
  if (consent.otpVerifiedAt) {
    payload.push(new Date(consent.otpVerifiedAt).toISOString());
  }
  return crypto.createHmac('sha256', signingKey()).update(payload.join('|')).digest('hex');
}

// ---------------------------------------------------------------------------
// Consent OTP (audit M2)

export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_SECONDS = 10 * 60;

/**
 * Generate a fresh, unbiased OTP code. Zero-padded six digits. The code itself
 * is NEVER stored — the caller persists only its HMAC (single-use, Redis).
 */
export function generateOtpCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(OTP_CODE_LENGTH, '0');
}

/**
 * HMAC a one-time code under the same signing key. `identity` (consent +
 * patient pair) binds the code to exactly the record it was issued for, so a
 * code delivered for consent A can never sign consent B.
 */
export function hashOtpCode(code, identity) {
  return crypto
    .createHmac('sha256', signingKey())
    .update(`consent-otp|${identity}|${String(code)}`)
    .digest('hex');
}

/**
 * Recompute the stored hash and compare — `true` when the record was not
 * tampered with after signing.
 */
export function isSignatureValid(consent) {
  const sig = consent.signature || {};
  if (!consent.patient || !sig.hash || !sig.name || !sig.signedAt) return false;
  const expected = computeSignatureHash(
    {
      patient: consent.patient,
      type: consent.type,
      title: consent.title,
      version: consent.version,
      termsText: consent.termsText,
      summary: consent.summary,
      patientStatement: consent.patientStatement,
      treatmentPlan: consent.treatmentPlan,
      attachmentUrl: consent.attachmentUrl,
      expiresAt: consent.expiresAt,
      // Audit M2: OTP-verified signatures bind the verification stamp into the
      // HMAC; non-OTP records leave it unset and hash as before.
      otpVerifiedAt: sig.otpVerifiedAt || null,
    },
    sig.signedAt,
    sig.name,
  );
  return expected === sig.hash;
}