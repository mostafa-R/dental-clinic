import mongoose from 'mongoose';

const errorLogSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    method: { type: String, required: true },
    url: { type: String, required: true },
    statusCode: { type: Number, required: true },
    message: { type: String, default: '' },
    stack: { type: String, default: '' },
    requestId: { type: String, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true },
);

errorLogSchema.index({ tenant: 1, createdAt: -1 });
errorLogSchema.index({ statusCode: 1 });
errorLogSchema.index({ createdAt: -1 });

const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);
export default ErrorLog;
