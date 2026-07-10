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
  const result = await this.findByIdAndUpdate(
    counterId,
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true },
  );
  return result.seq;
};

const Counter = mongoose.model('Counter', counterSchema);

export default Counter;
