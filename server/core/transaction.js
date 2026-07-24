import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const TRANSIENT_CODES = new Set([
  'TransientTransactionError',
  'UnknownTransactionCommitResult',
]);

/**
 * Execute a function within a MongoDB transaction session.
 * Manages the full session lifecycle: start → commit/abort → cleanup.
 * Automatically retries on transient transaction errors (e.g. write conflicts).
 *
 * Usage:
 *   const result = await withTransaction(async (session) => {
 *     await Model.create([doc], { session });
 *     await otherModel.updateOne(filter, update, { session });
 *     return result;
 *   });
 */
export async function withTransaction(fn) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    let transactionStarted = false;
    try {
      session.startTransaction();
      transactionStarted = true;
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (err) {
      if (transactionStarted) {
        try {
          await session.abortTransaction();
        } catch (abortErr) {
          logger.warn({ err: abortErr }, 'Failed to abort transaction');
        }
      }
      const isTransient = err.errorLabels &&
        err.errorLabels.some((label) => TRANSIENT_CODES.has(label));
      if (isTransient && attempt < MAX_RETRIES) {
        logger.warn({ attempt, err: err.message }, 'Transient transaction error, retrying');
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
        continue;
      }
      throw err;
    } finally {
      session.endSession();
    }
  }
}
