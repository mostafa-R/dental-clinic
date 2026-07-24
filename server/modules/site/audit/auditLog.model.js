import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SiteAdmin',
      required: true,
      index: true,
    },
    adminEmail: { type: String, required: true },
    adminRole: { type: String, required: true },
    action: {
      type: String,
      required: true,
      enum: [
        'tenant.create', 'tenant.update', 'tenant.suspend', 'tenant.activate',
        'tenant.archive', 'tenant.delete', 'tenant.impersonate',
        'branch.create', 'branch.update', 'branch.delete',
        'admin.create', 'admin.update', 'admin.delete', 'admin.update_permissions',
        'subscription.update', 'plan.create', 'plan.update', 'plan.delete',
        'platform.update', 'feature.toggle', '2fa.enable', '2fa.disable',
        'quarantine.set', 'quarantine.remove', 'impersonation.start', 'impersonation.end',
      ],
    },
    target: {
      type: { type: String, enum: ['tenant', 'branch', 'admin', 'subscription', 'plan', 'platform'] },
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String },
    },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    requestId: { type: String, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ 'target.type': 1, 'target.id': 1 });
auditLogSchema.index({ admin: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
