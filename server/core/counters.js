import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { collection: 'counters' },
);

/**
 * Get the next sequence number for a given counter name.
 * When `tenantId` is provided, the counter is scoped to that tenant
 * so each clinic gets its own independent sequence starting from 1.
 * For backward compatibility, when `tenantId` is omitted the global
 * counter is used (platform-level entities).
 *
 * Pass an optional `session` (from `withTransaction`) so the increment is
 * joined to the caller's transaction. Without this, a counter bumped inside
 * a pre-save hook of a transactional flow would NOT be rolled back when the
 * transaction aborts, burning sequence numbers, and two concurrent upserts
 * of the same counter document could surface a spurious E11000/409.
 */
counterSchema.statics.next = async function next(name, tenantId, session) {
  const counterId = tenantId ? `${name}:${String(tenantId)}` : name;

  const options = {
    returnDocument: 'after',
    upsert: true,
    setDefaultsOnInsert: true,
  };
  if (session) options.session = session;

  const result = await this.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    options,
  );

  if (result && result.seq != null) return result.seq;

  const doc = await this.findById(counterId).session(session).lean();
  if (doc) return doc.seq;

  try {
    await this.create([{ _id: counterId, seq: 1 }], session ? { session } : {});
    return 1;
  } catch {
    const retry = await this.findById(counterId).session(session).lean();
    return retry.seq;
  }
};

const Counter = mongoose.model('Counter', counterSchema);

export default Counter;
