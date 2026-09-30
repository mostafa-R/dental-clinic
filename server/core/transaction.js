import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const MAX_RETRIES = 6;
const MAX_COMMIT_RETRIES = 6;
const RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 2000;

const TRANSIENT_CODES = new Set([
  'TransientTransactionError',
  'UnknownTransactionCommitResult',
]);

const isTransient = (err) =>
  Boolean(err?.errorLabels?.some((label) => TRANSIENT_CODES.has(label)));

/**
 * Execute a function within a MongoDB transaction session.
 * Manages the full session lifecycle: start → commit/abort → cleanup.
 *
 * Retry semantics matter here and are the reason this helper does not simply
 * wrap the body in a loop:
 *
 *  - `TransientTransactionError` means the whole transaction was aborted, so
 *    re-running the callback in a fresh session is correct.
 *  - `UnknownTransactionCommitResult` means the COMMIT may already have
 *    succeeded and only its acknowledgement was lost. The driver's contract is
 *    to retry `commitTransaction()` on the SAME session — re-running the
 *    business callback there would execute every write a second time against a
 *    snapshot taken after the first commit, double-charging patients,
 *    double-numbering invoices, and double-posting journal entries.
 *
 * The two are therefore handled on separate loops.
 */
export async function withTransaction(fn) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    let transactionStarted = false;
    let commitOutcomeUnknown = false;
    try {
      session.startTransaction();
      transactionStarted = true;
      const result = await fn(session);

      // Commit-only retry loop. Same session, callback never re-executed.
      for (let commitAttempt = 1; ; commitAttempt++) {
        try {
          await session.commitTransaction();
          transactionStarted = false;
          return result;
        } catch (commitErr) {
          if (
            commitErr.errorLabels?.includes('UnknownTransactionCommitResult') &&
            commitAttempt < MAX_COMMIT_RETRIES
          ) {
            logger.warn(
              { commitAttempt },
              'Unknown commit result, retrying commit on the same session',
            );
            continue;
          }
          // Out of commit retries. The commit may still have landed, so this
          // must never be replayed as a fresh transaction.
          if (commitErr.errorLabels?.includes('UnknownTransactionCommitResult')) {
            commitOutcomeUnknown = true;
          }
          throw commitErr;
        }
      }
    } catch (err) {
      if (transactionStarted) {
        try {
          await session.abortTransaction();
        } catch (abortErr) {
          logger.warn({ err: abortErr }, 'Failed to abort transaction');
        }
      }
      // Replaying the callback is only safe when the transaction is known to
      // have been aborted. If the commit outcome is unknown the work may
      // already be durable, so surfacing the error lets the caller apply its
      // own idempotency guard instead of silently double-posting.
      if (!commitOutcomeUnknown && isTransient(err) && attempt < MAX_RETRIES) {
        logger.warn({ attempt, err: err.message }, 'Transient transaction error, retrying');
        const cappedDelay = Math.min(RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
        await new Promise((r) => setTimeout(r, cappedDelay));
        continue;
      }
      throw err;
    } finally {
      session.endSession();
    }
  }
}
