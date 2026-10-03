import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  signingKey,
  computeSignatureHash,
  isSignatureValid,
} from '../modules/emr/consent.service.js';

/**
 * The consent signing key guards the tamper-evidence of signed consents.
 *
 * The bug this covers: `signingKey()` fell back to a literal
 * `'dev-only-consent-key'` when neither `CONSENT_SIGNING_KEY` nor `JWT_SECRET`
 * was set. That literal is in the source, so anyone who can read the repo can
 * recompute a signature over any record and make `isSignatureValid` return
 * `true` for a consent whose text was altered after the patient signed it. In
 * production the check would be decorative.
 *
 * Two distinct failure modes are covered, because they behave differently:
 *  - production without a key must throw rather than sign with a public key;
 *  - a key that changes between signing and verifying must invalidate the
 *    signature (this is why the fallback also hurts locally — dev records stop
 *    verifying as soon as the env is set properly).
 */

const ENV_KEYS = ['CONSENT_SIGNING_KEY', 'JWT_SECRET', 'NODE_ENV'];
const saved = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const consent = () => ({
  patient: '507f1f77bcf86cd799439011',
  type: 'treatment',
  title: 'Root canal',
  version: 2,
  termsText: 'agreed text',
});

const SIGNED_AT = '2026-02-01T10:00:00.000Z';
const SIGNER = 'Patient';

/** A record as `signConsent` would persist it: the HMAC under `signature`. */
function signedConsent() {
  const record = consent();
  return {
    ...record,
    signature: {
      hash: computeSignatureHash(record, SIGNED_AT, SIGNER),
      name: SIGNER,
      signedAt: SIGNED_AT,
    },
  };
}

describe('consent signing key', () => {
  it('refuses to sign in production when no key is configured', () => {
    delete process.env.CONSENT_SIGNING_KEY;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    expect(() => signingKey()).toThrow(/CONSENT_SIGNING_KEY/);
    expect(() => computeSignatureHash(consent(), SIGNED_AT, SIGNER)).toThrow(
      /CONSENT_SIGNING_KEY/,
    );
    // Even an unsigned record reports as invalid rather than crashing the
    // verify endpoint: callers treat a false as "not signed", a throw is a 500.
    expect(() => isSignatureValid(signedConsent())).toThrow(/CONSENT_SIGNING_KEY/);
  });

  it('names the requirement rather than silently degrading in production', () => {
    delete process.env.CONSENT_SIGNING_KEY;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    // A vague error here would surface as a 500 at the first consent signature
    // in production, which is exactly when it is most expensive to debug.
    expect(() => signingKey()).toThrow(/built-in key/);
  });

  it('prefers CONSENT_SIGNING_KEY over JWT_SECRET', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONSENT_SIGNING_KEY = 'consent-specific-key';
    process.env.JWT_SECRET = 'jwt-key';

    expect(signingKey()).toBe('consent-specific-key');
  });

  it('accepts JWT_SECRET alone so deployments do not need a second secret', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CONSENT_SIGNING_KEY;
    process.env.JWT_SECRET = 'jwt-key';

    expect(signingKey()).toBe('jwt-key');
  });

  it('keeps the development fallback so local work needs no extra setup', () => {
    delete process.env.CONSENT_SIGNING_KEY;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'development';

    expect(signingKey()).toBe('dev-only-consent-key');
  });

  it('invalidates a signature when the key changes after signing', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONSENT_SIGNING_KEY = 'key-at-signing-time';

    const signed = signedConsent();
    expect(isSignatureValid(signed)).toBe(true);

    // Rotate the secret: the stored hash can no longer be reproduced, so the
    // record must be reported as tampered rather than quietly trusted.
    process.env.CONSENT_SIGNING_KEY = 'key-after-rotation';
    expect(isSignatureValid(signed)).toBe(false);
  });

  it('detects edited terms after signing under the same key', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONSENT_SIGNING_KEY = 'stable-key';

    const signed = signedConsent();
    expect(isSignatureValid(signed)).toBe(true);
    // Changing what the patient agreed to must invalidate the signature; this
    // is the property the whole HMAC exists to provide.
    expect(isSignatureValid({ ...signed, termsText: 'agreed text (plus more)' })).toBe(false);
  });

  it('detects a different signer name than the one recorded', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONSENT_SIGNING_KEY = 'stable-key';

    const signed = signedConsent();
    // The signer name is part of the HMAC payload, so a consent cannot be
    // re-attributed from the patient to a guardian without detection.
    expect(
      isSignatureValid({ ...signed, signature: { ...signed.signature, name: 'Someone Else' } }),
    ).toBe(false);
  });

  it('treats a record with no signature as invalid rather than throwing', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONSENT_SIGNING_KEY = 'stable-key';

    const { signature, ...unsigned } = signedConsent();
    expect(isSignatureValid(unsigned)).toBe(false);
    expect(isSignatureValid({ ...signedConsent(), signature: {} })).toBe(false);
  });
});