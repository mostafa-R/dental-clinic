import mongoose from "mongoose";

const backupLogSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    error: { type: String, default: "" },
    type: {
      type: String,
      enum: ["scheduled", "manual"],
      default: "scheduled",
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dbSizeBytes: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

backupLogSchema.index({ createdAt: -1 });
backupLogSchema.index({ status: 1 });

const BackupLog = mongoose.model("BackupLog", backupLogSchema);
export default BackupLog;
