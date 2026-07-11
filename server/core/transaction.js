import mongoose from 'mongoose';

/**
 * Execute a function within a MongoDB transaction session.
 * Manages the full session lifecycle: start → commit/abort → cleanup.
 *
 * Usage:
 *   const result = await withTransaction(async (session) => {
 *     await Model.create([doc], { session });
 *     await otherModel.updateOne(filter, update, { session });
 *     return result;
 *   });
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
