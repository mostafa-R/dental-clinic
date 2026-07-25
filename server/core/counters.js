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
 */
counterSchema.statics.next = async function next(name, tenantId) {
  const counterId = tenantId ? `${name}:${String(tenantId)}` : name;

  const result = await this.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  );

  if (result && result.seq != null) return result.seq;

  const doc = await this.findById(counterId).lean();
  if (doc) return doc.seq;

  try {
    await this.create({ _id: counterId, seq: 1 });
    return 1;
  } catch {
    const retry = await this.findById(counterId).lean();
    return retry.seq;
  }
};

const Counter = mongoose.model('Counter', counterSchema);

export default Counter;
