import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the consent OTP flow (audit M2).
 *
 * The old `signConsent` accepted `method: 'otp'` with ANY name + phone and
 * verified nothing — the stored hash only proved the CONSENT TEXT had not
 * changed, so a staff member could sign as the patient with a phone number
 * alone. The fix adds a real one-time code: delivered to the phone on file,
 * stored only as a single-use HMAC in Redis, consumed at sign time, and the
 * verification stamp is bound into the tamper-evident signature hash.
 *
 * Pinned properties:
 *   1. `POST .../send-otp` sends a code to the phone ON FILE and stores only
 *      its HMAC (the plaintext code never persists);
 *   2. signing with the correct code succeeds and stamps `otpVerifiedAt`;
 *   3. signing with a wrong code (or with no code requested) is rejected and
 *      does not change the consent status;
 *   4. the code is consumed on the first attempt — a correct code replayed a
 *      second time fails;
 *   5. a signature made without the OTP stamp (non-otp method) still verifies
 *      with `isSignatureValid` — the hash shape stayed backwards compatible.
 */

const sendSuccess = vi.fn();
const loadScopedPatient = vi.fn();
const toObjectId = vi.fn((v) => v);

vi.mock('../utils/sendSuccess.js', () => ({ sendSuccess: (res, payload, status) => sendSuccess(res, payload, status) }));
vi.mock('../utils/branchScope.js', () => ({
  loadScopedPatient: (...a) => loadScopedPatient(...a),
  toObjectId: (...a) => toObjectId(...a),
}));

const findOne = vi.fn();
/**
 * `loadConsent` chains `.populate()` on whatever `findOne` returns. Wrap the
 * mocked result (a document OR a resolving promise, depending on how the mock
 * was set) in a chainable that carries both shapes.
 */
const consentQuery = (getSource) => ({
  populate: vi.fn(async () => getSource()),
  then: (resolve, reject) => Promise.resolve(getSource()).then(resolve, reject),
});
vi.mock('../modules/emr/consent.model.js', () => ({
  default: {
    findOne: (...a) => consentQuery(() => findOne(...a)),
  },
}));

// Fake Redis-tier cache, so the flow's real storage shape is exercised.
const cacheStore = new Map();
vi.mock('../utils/cache.js', () => ({
  cacheGet: vi.fn(async (_ns, key) => cacheStore.get(key) ?? null),
  cacheSet: vi.fn(async (_ns, key, value) => cacheStore.set(key, value)),
  cacheDel: vi.fn(async (_ns, key) => cacheStore.delete(key)),
}));

const sentWhatsApp = vi.fn().mockResolvedValue({});
vi.mock('../services/whatsapp.js', () => ({
  sendWhatsAppMessage: (...a) => sentWhatsApp(...a),
}));

vi.mock('../socket/index.js', () => ({ emitToBranch: vi.fn() }));
vi.mock('../services/eventBus.js', () => ({ publishEvent: vi.fn() }));
vi.mock('../middleware/phiRestrict.js', () => ({ stripPHI: (o) => o }));

const { sendConsentOtp, signConsent } = await import('../modules/emr/consent.controller.js');
const { isSignatureValid, hashOtpCode } = await import('../modules/emr/consent.service.js');

const PATIENT_ID = '507f1f77bcf86cd799439011';
const CONSENT_ID = '507f191e810c19729de860ea';
const PHONE = '+201001234567';

const run = async (handler, reqBody) => {
  sendSuccess.mockClear();
  const req = {
    params: { patientId: PATIENT_ID, consentId: CONSENT_ID },
    validatedBody: reqBody,
    ip: '10.0.0.1',
    user: { _id: 'staff-1' },
    socket: { remoteAddress: '10.0.0.1' },
  };
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  let thrown;
  await handler(req, res, (e) => {
    thrown = e;
  });
  if (thrown) throw thrown;
  return sendSuccess.mock.calls[0]?.[1];
};

beforeEach(() => {
  vi.clearAllMocks();
  sentWhatsApp.mockResolvedValue({});
  cacheStore.clear();
  loadScopedPatient.mockResolvedValue({ _id: PATIENT_ID, branch: 'b1', tenant: 'tenant-1', phone: PHONE });
});

const consentFixture = (overrides = {}) => {
  const doc = {
    _id: CONSENT_ID,
    status: 'sent',
    type: 'treatment',
    title: 'Root canal consent',
    version: 2,
    termsText: 'The explained procedure.',
    summary: '',
    patientStatement: undefined,
    treatmentPlan: null,
    attachmentUrl: '',
    expiresAt: null,
    patient: PATIENT_ID,
    signature: null,
    ...overrides,
    save: vi.fn(async () => doc),
    populate: vi.fn().mockResolvedValue(undefined),
    toJSON() {
      return doc;
    },
  };
  return doc;
};

describe('consent OTP signatures', () => {
  it('sends a real code to the phone on file and stores only its HMAC', async () => {
    findOne.mockResolvedValue(consentFixture());

    await run(sendConsentOtp);

    expect(sentWhatsApp).toHaveBeenCalledTimes(1);
    const [tenantId, to, message] = sentWhatsApp.mock.calls[0];
    expect(String(to)).toBe(PHONE);
    const code = message.match(/\b(\d{6})\b/) ? message.match(/\b(\d{6})\b/)[1] : null;
    expect(code).toBeTruthy();

    // Only the HMAC is persisted — the plaintext code must not be in Redis.
    const values = [...cacheStore.values()];
    expect(values).toHaveLength(1);
    expect(JSON.stringify(values)).not.toContain(code);
    expect(values[0].hash).toBe(hashOtpCode(code, `${CONSENT_ID}:${PATIENT_ID}`));
  });

  it('signs with the correct code and stamps otpVerifiedAt into the hash', async () => {
    findOne.mockResolvedValue(consentFixture());
    await run(sendConsentOtp);
    const code = sentWhatsApp.mock.calls[0][2].match(/\b(\d{6})\b/)[1];

    // Re-fetch a FRESH fixture so the first save does not already mutate the
    // document the second call reads.
    const doc = consentFixture();
    findOne.mockResolvedValue(doc);

    await run(signConsent, {
      signature: { method: 'otp', name: 'Jane Patient', phone: PHONE },
      otp: code,
    });

    expect(doc.status).toBe('signed');
    expect(doc.signature.method).toBe('otp');
    expect(doc.signature.otpVerifiedAt).toBeTruthy();
    expect(doc.signature.hash).toBeTruthy();

    // And the stored signature verifies against the recomputed hash.
    const raw = { ...doc, signature: { ...doc.signature } };
    delete raw.save;
    delete raw.populate;
    raw.patient = PATIENT_ID;
    expect(isSignatureValid(raw)).toBe(true);
  });

  it('rejects a wrong code and consumes it (single use)', async () => {
    findOne.mockResolvedValue(consentFixture());
    await run(sendConsentOtp);
    const code = sentWhatsApp.mock.calls[0][2].match(/\b(\d{6})\b/)[1];
    const doc = consentFixture();
    findOne.mockResolvedValue(doc);

    await expect(
      run(signConsent, {
        signature: { method: 'otp', name: 'Jane Patient', phone: PHONE },
        otp: '000000' !== code ? '000000' : '111111',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(doc.status).toBe('sent');

    // The correct code must NOT still sign afterwards: the failed attempt
    // consumed the pending record.
    await expect(
      run(signConsent, {
        signature: { method: 'otp', name: 'Jane Patient', phone: PHONE },
        otp: code,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an otp signature when no code was requested', async () => {
    findOne.mockResolvedValue(consentFixture());

    await expect(
      run(signConsent, {
        signature: { method: 'otp', name: 'Jane Patient', phone: PHONE },
        otp: '123456',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('fails the send when the patient has no phone on file', async () => {
    loadScopedPatient.mockResolvedValue({ _id: PATIENT_ID, branch: 'b1', tenant: 'tenant-1', phone: '' });
    findOne.mockResolvedValue(consentFixture());

    await expect(run(sendConsentOtp)).rejects.toMatchObject({ statusCode: 400 });
    expect(sentWhatsApp).not.toHaveBeenCalled();
    // Nothing was persisted either — no pending code can exist for a send
    // that never left the building.
    expect(cacheStore.size).toBe(0);
  });

  it('does not break verification of pre-OTP signatures', async () => {
    // A signature recorded before the OTP flow existed must still be valid —
    // the hash payload only changes when an otpVerifiedAt stamp is present.
    const { computeSignatureHash } = await import('../modules/emr/consent.service.js');
    const signedAt = new Date('2026-01-01T00:00:00.000Z');
    const facts = { patient: PATIENT_ID, type: 'treatment', title: 'Root canal consent', version: 2, termsText: 'T', summary: '', patientStatement: '', treatmentPlan: null, attachmentUrl: '', expiresAt: null };
    const hash = computeSignatureHash(facts, signedAt, 'Jane Patient');
    expect(isSignatureValid({ ...facts, signature: { method: 'typed', name: 'Jane Patient', signedAt, hash, otpVerifiedAt: null } })).toBe(true);
  });
});
