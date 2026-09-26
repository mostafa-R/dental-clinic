import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for the impersonation PHI leak in `verifyConsent`.
 *
 * The bug: the response was built from a raw object literal rather than going
 * through the shared `serialize()`, and the signer name is not part of
 * `PHI_FIELDS` (`name` is also used for non-PHI staff references), so
 * `stripPHI` could not remove it. During impersonation the endpoint therefore
 * disclosed the patient/guardian signature name, which a platform admin is not
 * entitled to see.
 *
 * The fix omits `signerName` entirely while impersonating, and keeps it for a
 * normally authorized clinic user, who legitimately needs it to display the
 * consent.
 */

const sendSuccess = vi.fn();
const loadScopedPatient = vi.fn();
const toObjectId = vi.fn((v) => v);

vi.mock('../utils/sendSuccess.js', () => ({ sendSuccess: (res, payload) => sendSuccess(res, payload) }));
vi.mock('../utils/branchScope.js', () => ({
  loadScopedPatient: (...a) => loadScopedPatient(...a),
  toObjectId: (...a) => toObjectId(...a),
}));

const findOne = vi.fn();
vi.mock('../modules/emr/consent.model.js', () => ({
  default: { findOne: (...a) => findOne(...a) },
}));

vi.mock('../modules/emr/consent.service.js', () => ({
  computeSignatureHash: vi.fn(),
  isSignatureValid: vi.fn(() => true),
}));

vi.mock('../socket/index.js', () => ({ emitToBranch: vi.fn() }));
vi.mock('../services/eventBus.js', () => ({ publishEvent: vi.fn() }));
vi.mock('../middleware/phiRestrict.js', () => ({ stripPHI: (o) => o }));

const { verifyConsent } = await import('../modules/emr/consent.controller.js');

// The controller validates ids with `mongoose.isValidObjectId`, so these must
// be real 24-char hex ObjectIds rather than readable placeholders.
const PATIENT_ID = '507f1f77bcf86cd799439011';
const CONSENT_ID = '507f191e810c19729de860ea';

const run = async ({ isImpersonation }) => {
  sendSuccess.mockClear();
  const req = {
    params: { patientId: PATIENT_ID, consentId: CONSENT_ID },
    isImpersonation,
    user: { _id: 'u1' },
  };
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  // The handler is wrapped in asyncHandler, which forwards rejections to
  // next(err); capture it so a throw surfaces as a test failure.
  let thrown;
  await verifyConsent(req, res, (e) => {
    thrown = e;
  });
  if (thrown) throw thrown;

  expect(sendSuccess).toHaveBeenCalledTimes(1);
  return sendSuccess.mock.calls[0][1];
};

const consentDoc = () => ({
  status: 'signed',
  type: 'treatment',
  version: 3,
  signature: { name: 'Jane Patient', signedAt: '2026-01-01T00:00:00.000Z', method: 'typed' },
  toJSON() {
    return this;
  },
});

describe('verifyConsent impersonation redaction', () => {
  beforeEach(() => {
    loadScopedPatient.mockResolvedValue({ _id: PATIENT_ID, branch: 'b1' });
    // loadConsent() resolves the consent from the patient.
    findOne.mockResolvedValue(consentDoc());
  });

  // The regression this file exists for.
  it('omits signerName while impersonating', async () => {
    const payload = await run({ isImpersonation: true });

    expect(payload).not.toHaveProperty('signerName');
    expect(JSON.stringify(payload)).not.toContain('Jane Patient');
  });

  it('still returns the non-name fields while impersonating', async () => {
    const payload = await run({ isImpersonation: true });

    expect(payload.verified).toBe(true);
    expect(payload.signed).toBe(true);
    expect(payload.type).toBe('treatment');
    expect(payload.version).toBe(3);
  });

  it('returns signerName to a normally authorized clinic user', async () => {
    const payload = await run({ isImpersonation: false });

    expect(payload.signerName).toBe('Jane Patient');
  });

  it('omits signerName rather than sending an empty string while impersonating', async () => {
    const payload = await run({ isImpersonation: true });

    // An empty key would be ambiguous with "no signature captured", and leaks
    // the schema shape; the key must be absent entirely.
    expect('signerName' in payload).toBe(false);
  });
});
