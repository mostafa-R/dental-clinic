import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const startSession = vi.fn();
const abortTransaction = vi.fn();
const endSession = vi.fn();
const commitTransaction = vi.fn();
const startTransaction = vi.fn();

vi.mock('mongoose', () => ({
  default: {
    startSession: (...args) => startSession(...args),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { withTransaction } = await import('../core/transaction.js');

function unknownCommitResult() {
  const err = new Error('connection timed out during commit');
  err.errorLabels = ['UnknownTransactionCommitResult'];
  return err;
}

function transientTransactionError() {
  const err = new Error('write conflict');
  err.errorLabels = ['TransientTransactionError'];
  return err;
}

describe('withTransaction commit-retry semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks does not drop implementations, so reset explicitly to
    // stop one test's rejection from leaking into the next.
    commitTransaction.mockReset();
    startSession.mockReset();
    startSession.mockImplementation(async () => ({
      startTransaction,
      commitTransaction,
      abortTransaction,
      endSession,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the callback result and commits once on the happy path', async () => {
    commitTransaction.mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue({ ok: true });

    await expect(withTransaction(fn)).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(commitTransaction).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('retries commit on the SAME session without re-running the callback', async () => {
    // The commit landed but the acknowledgement was lost: the driver reports
    // UnknownTransactionCommitResult. The business callback must not run again,
    // or a payment/invoice/journal entry would be posted twice.
    commitTransaction
      .mockRejectedValueOnce(unknownCommitResult())
      .mockResolvedValueOnce(undefined);
    const fn = vi.fn().mockResolvedValue('charged');

    await expect(withTransaction(fn)).resolves.toBe('charged');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(commitTransaction).toHaveBeenCalledTimes(2);
    // Same session throughout: startSession is called exactly once.
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('does not replay the callback when the commit outcome stays unknown', async () => {
    commitTransaction.mockRejectedValue(unknownCommitResult());
    const fn = vi.fn().mockResolvedValue('charged');

    await expect(withTransaction(fn)).rejects.toThrow('connection timed out');

    // The work may already be durable, so the callback is never re-run.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('replays the callback only for a genuinely aborted transaction', async () => {
    // TransientTransactionError means nothing was written, so a fresh session
    // replay is safe and is the documented driver behaviour.
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transientTransactionError())
      .mockResolvedValueOnce('ok');

    await expect(withTransaction(fn)).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(startSession).toHaveBeenCalledTimes(2);
    expect(abortTransaction).toHaveBeenCalledTimes(1);
  });

  it('aborts the session and rethrows a non-transient failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('validation failed'));

    await expect(withTransaction(fn)).rejects.toThrow('validation failed');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(abortTransaction).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
  });
});
