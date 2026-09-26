import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for SKU uniqueness on inventory edits.
 *
 * The bug: the duplicate-SKU guard looked up the existing item with
 * `branch: toObjectId(branchFilter.branch)`. A system admin's `filterByBranch`
 * legitimately carries no branch (they may narrow with `?branch=`), so that
 * became `branch: null`, matched nothing, and the duplicate fell through to the
 * unique compound index — surfacing as an opaque 500 instead of a clean 409.
 *
 * The branch must come from the item being edited, not from the caller's scope.
 */

const findOne = vi.fn();
const findOneAndUpdate = vi.fn();

vi.mock('../modules/inventory/inventory.model.js', () => ({
  default: {
    findOne: (...a) => findOne(...a),
    findOneAndUpdate: (...a) => findOneAndUpdate(...a),
    create: vi.fn(),
  },
}));

vi.mock('../services/inventoryCron.js', () => ({ emitItemAlerts: vi.fn() }));

const { updateItem } = await import('../modules/inventory/inventory.service.js');

const ITEM_ID = '507f1f77bcf86cd799439011';
const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';

/** Chainable, awaitable stand-in for a Mongoose query. */
const query = (result) => {
  const q = {
    select: vi.fn(() => q),
    lean: vi.fn(() => q),
    sort: vi.fn(() => q),
    then: (a, b) => Promise.resolve(result).then(a, b),
  };
  return q;
};

describe('updateItem SKU uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOneAndUpdate.mockReturnValue(query({ _id: ITEM_ID, branch: BRANCH_A, sku: 'SKU-1' }));
  });

  // The regression this file exists for.
  it('scopes the duplicate check to the edited item branch, not the caller scope', async () => {
    // System admin: the filter has a tenant but no branch.
    findOne
      .mockReturnValueOnce(query({ branch: BRANCH_B })) // resolve the item
      .mockReturnValueOnce(query(null)); // no duplicate

    await updateItem(ITEM_ID, { tenant: 'tenant-1' }, { sku: 'SKU-1', name: 'Glove' });

    const [resolveFilter] = findOne.mock.calls[0];
    const [dupeFilter] = findOne.mock.calls[1];
    expect(resolveFilter.branch).toBeUndefined();
    expect(dupeFilter.branch).toBe(BRANCH_B);
    expect(dupeFilter.sku).toBe('SKU-1');
  });

  it('rejects a duplicate SKU in the same branch with a 409', async () => {
    findOne
      .mockReturnValueOnce(query({ branch: BRANCH_A }))
      .mockReturnValueOnce(query({ _id: 'other-item' }));

    let thrown;
    try {
      await updateItem(ITEM_ID, { branch: BRANCH_A }, { sku: 'SKU-1', name: 'Glove' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeTruthy();
    expect(thrown.statusCode).toBe(409);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows the same SKU in a different branch', async () => {
    findOne
      .mockReturnValueOnce(query({ branch: BRANCH_A }))
      .mockReturnValueOnce(query(null));

    await updateItem(ITEM_ID, { branch: BRANCH_A }, { sku: 'SKU-1', name: 'Glove' });
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('excludes the item itself from the duplicate check', async () => {
    findOne
      .mockReturnValueOnce(query({ branch: BRANCH_A }))
      .mockReturnValueOnce(query(null));

    await updateItem(ITEM_ID, { branch: BRANCH_A }, { sku: 'SKU-1' });
    expect(findOne.mock.calls[1][0]._id).toEqual({ $ne: ITEM_ID });
  });

  it('404s when the item is not in the caller scope, before writing', async () => {
    findOne.mockReturnValueOnce(query(null));

    let thrown;
    try {
      await updateItem(ITEM_ID, { branch: BRANCH_B }, { sku: 'SKU-1' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown?.statusCode).toBe(404);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('skips the duplicate lookup entirely when the SKU is unchanged', async () => {
    await updateItem(ITEM_ID, { branch: BRANCH_A }, { name: 'Gloves' });
    // Only the write; no SKU resolution query.
    expect(findOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
