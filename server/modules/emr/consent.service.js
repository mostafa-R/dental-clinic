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
  ].join('|');
  return crypto.createHmac('sha256', signingKey()).update(payload).digest('hex');
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
    },
    sig.signedAt,
    sig.name,
  );
  return expected === sig.hash;
}