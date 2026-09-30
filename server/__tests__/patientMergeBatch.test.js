import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for the atomic duplicate-group merge.
 *
 * The panel used to fan out one request per duplicate, so each merge was its
 * own transaction: a failure on the third pair left the first two committed
 * and the operator had to reconcile a half-merged group by hand. The batch
 * endpoint exists to make that state unreachable, which means the guarantee
 * lives in exactly two places worth pinning down:
 *
 *   1. the schema rejects the shapes whose result would depend on the order
 *      the pairs happen to be processed in (a chain, a self-merge, a repeat);
 *   2. the controller opens *one* transaction for the whole set and publishes
 *      no events when any pair throws.
 *
 * The models are mocked because the interesting logic is the orchestration,
 * not Mongo. Assertions 1 and 2 above are what a refactor could silently
 * break, and neither needs a live replica set to verify.
 */

const OBJECT_ID = /^[0-9a-f]{24}$/;
const ID_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ID_C = 'cccccccccccccccccccccccc';
const BRANCH = 'branch-1';
const TENANT = 'tenant-1';

// ---------------------------------------------------------------- schema

const { mergePatientsBatchSchema } = await import('../modules/patients/patient.validator.js');

describe('mergePatientsBatchSchema', () => {
  const pair = (duplicateId, survivorId) => ({ merges: [{ duplicateId, survivorId }] });

  it('accepts a single well-formed pair', () => {
    expect(mergePatientsBatchSchema.safeParse(pair(ID_A, ID_B)).success).toBe(true);
  });

  it('accepts several duplicates into one survivor', () => {
    const result = mergePatientsBatchSchema.safeParse({
      merges: [
        { duplicateId: ID_A, survivorId: ID_C },
        { duplicateId: ID_B, survivorId: ID_C },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a self-merge', () => {
    const result = mergePatientsBatchSchema.safeParse(pair(ID_A, ID_A));
    expect(result.success).toBe(false);
  });

  it('rejects the same duplicate twice', () => {
    const result = mergePatientsBatchSchema.safeParse({
      merges: [
        { duplicateId: ID_A, survivorId: ID_B },
        { duplicateId: ID_A, survivorId: ID_C },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a chain, where the outcome would depend on processing order', () => {
    // A into B, then B into C. Applied in order this silently moves records
    // twice; applied in the other order it fails. Neither is acceptable.
    const result = mergePatientsBatchSchema.safeParse({
      merges: [
        { duplicateId: ID_A, survivorId: ID_B },
        { duplicateId: ID_B, survivorId: ID_C },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty batch', () => {
    expect(mergePatientsBatchSchema.safeParse({ merges: [] }).success).toBe(false);
  });

  it('rejects a malformed id', () => {
    expect(mergePatientsBatchSchema.safeParse(pair('not-an-id', ID_B)).success).toBe(false);
  });
});

// ------------------------------------------------------------- controller

const emitToBranch = vi.fn();
const withTransaction = vi.fn();

/** Chainable, awaitable stand-in for a Mongoose query. */
const query = (result) => {
  const q = {
    session: vi.fn(() => q),
    select: vi.fn(() => q),
    lean: vi.fn(() => q),
    sort: vi.fn(() => q),
    then: (a, b) => Promise.resolve(result).then(a, b),
  };
  return q;
};

const patientDoc = (overrides = {}) => ({
  _id: ID_A,
  branch: BRANCH,
  tenant: TENANT,
  isActive: true,
  mergedInto: null,
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

/** Every ref model is only ever `updateMany`'d; the value is irrelevant. */
const refModel = () => ({ updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }) });

vi.mock('mongoose', () => ({
  default: { isValidObjectId: (v) => OBJECT_ID.test(String(v)) },
  isValidObjectId: (v) => OBJECT_ID.test(String(v)),
}));

vi.mock('../core/transaction.js', () => ({
  withTransaction: (...a) => withTransaction(...a),
}));

vi.mock('../utils/branchScope.js', () => ({
  filterByBranch: () => ({ branch: BRANCH }),
  currentTenant: () => TENANT,
  resolveBranchForCreate: vi.fn(),
  toObjectId: (v) => v,
}));

vi.mock('../socket/index.js', () => ({ emitToBranch: (...a) => emitToBranch(...a) }));
vi.mock('../services/eventBus.js', () => ({ publishEvent: vi.fn() }));

vi.mock('../modules/patients/patient.model.js', () => ({
  default: { findOne: (...a) => patientFindOne(...a) },
}));
vi.mock('../modules/patients/wallet.model.js', () => ({
  default: { findOne: () => query(null) },
}));
vi.mock('../modules/patients/installment.model.js', () => ({ default: refModel() }));
vi.mock('../modules/users/branch.model.js', () => ({ default: refModel() }));
vi.mock('../modules/site/tenant/tenant.model.js', () => ({ default: refModel() }));
vi.mock('../modules/appointments/appointment.model.js', () => ({ default: refModel() }));
vi.mock('../modules/billing/invoice.model.js', () => ({ default: refModel() }));
vi.mock('../modules/billing/commission.model.js', () => ({ default: refModel() }));
vi.mock('../modules/accounting/ownerDrawing.model.js', () => ({ default: refModel() }));
vi.mock('../modules/emr/treatmentPlan.model.js', () => ({ default: refModel() }));
vi.mock('../modules/emr/prescription.model.js', () => ({ default: refModel() }));
vi.mock('../modules/emr/dentalChart.model.js', () => ({
  default: { findOne: () => query(null) },
}));
vi.mock('../modules/emr/attachment.model.js', () => ({ default: refModel() }));
vi.mock('../modules/emr/clinicalNote.model.js', () => ({ default: refModel() }));
vi.mock('../core/counters.js', () => ({
  default: { findOneAndUpdate: vi.fn().mockResolvedValue({}) },
}));

let patientFindOne;
const { mergePatientsBatch } = await import('../modules/patients/patient.controller.js');

/** Resolves both sides of a pair; `missing` makes one side not found. */
function stubPatients({ missing } = {}) {
  const seen = [];
  patientFindOne = (filter) => {
    const id = String(filter._id);
    seen.push(id);
    if (missing && id === missing) return query(null);
    return query(patientDoc({ _id: id }));
  };
  return seen;
}

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

/**
 * Runs the handler the way Express would. `asyncHandler` forwards a rejected
 * promise to `next` rather than rethrowing, so the error is observed there.
 */
const runBatch = async (merges) => {
  const req = { validatedBody: { merges }, user: {}, params: {} };
  const res = fakeRes();
  const next = vi.fn();
  await mergePatientsBatch(req, res, next);
  return { res, next };
};

describe('mergePatientsBatch orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withTransaction.mockImplementation(async (fn) => fn({ id: 'session' }));
  });

  it('applies every pair inside a single transaction', async () => {
    const seen = stubPatients();

    const { res, next } = await runBatch([
      { duplicateId: ID_A, survivorId: ID_C },
      { duplicateId: ID_B, survivorId: ID_C },
    ]);

    // The whole point: one transaction, not one per pair. A per-pair
    // implementation would show up here as 2.
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([ID_A, ID_C, ID_B, ID_C]);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.merged).toBe(2);
  });

  it('publishes one event per pair, only after the work succeeded', async () => {
    stubPatients();

    await runBatch([
      { duplicateId: ID_A, survivorId: ID_C },
      { duplicateId: ID_B, survivorId: ID_C },
    ]);

    expect(emitToBranch).toHaveBeenCalledTimes(2);
    expect(emitToBranch).toHaveBeenCalledWith(BRANCH, 'patient:merged', {
      mergedId: ID_A,
      survivorId: ID_C,
    });
  });

  it('propagates a mid-batch failure and emits nothing', async () => {
    // The second pair's record is gone (merged by someone else a moment ago).
    stubPatients({ missing: ID_B });

    const { next } = await runBatch([
      { duplicateId: ID_A, survivorId: ID_C },
      { duplicateId: ID_B, survivorId: ID_C },
    ]);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toMatch(/not found/i);

    // A throw inside the transaction rolls the first pair back, so announcing
    // it would be a lie.
    expect(emitToBranch).not.toHaveBeenCalled();
  });

  it('rejects a self-merge without touching any record', async () => {
    stubPatients();

    const { next } = await runBatch([{ duplicateId: ID_A, survivorId: ID_A }]);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].message).toMatch(/cannot be merged into itself/i);
    expect(emitToBranch).not.toHaveBeenCalled();
  });
});
