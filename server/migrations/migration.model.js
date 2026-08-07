import mongoose from 'mongoose';

const migrationSchema = new mongoose.Schema(
  {
    version: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    appliedAt: { type: Date, default: Date.now },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Migration = mongoose.model('Migration', migrationSchema);

export default Migration;
