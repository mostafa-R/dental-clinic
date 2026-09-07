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
  return process.env.CONSENT_SIGNING_KEY || process.env.JWT_SECRET || 'dev-only-consent-key';
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