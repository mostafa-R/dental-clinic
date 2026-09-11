import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SiteAdmin',
      default: null,
      index: true,
    },
    // Actor of a tenant-realm audit event (a clinic user, e.g. role change,
    // password reset, deactivation or branch delete). Mutually exclusive with
    // `admin`; one of the two is always present.
    tenantActor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Scope of the audited event. 'site' = platform/console (admin actor),
    // 'tenant' = inside a clinic (tenantActor actor).
    scope: {
      type: String,
      enum: ['site', 'tenant'],
      default: 'site',
      index: true,
    },
    adminEmail: { type: String, default: '' },
    adminRole: { type: String, default: '' },
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
        'user.role_change', 'user.password_reset', 'user.deactivate', 'user.activate',
        'role.permissions_change', 'auth.recovery_attempt',
      ],
    },
    target: {
      type: { type: String, enum: ['tenant', 'branch', 'admin', 'subscription', 'plan', 'platform', 'user', 'role'] },
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String },
    },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    requestId: { type: String, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    // Tamper-evidence: every entry links to the previous one via prevHash and
    // carries an HMAC over its own canonical content (see utils/auditChain.js).
    prevHash: { type: String, default: '' },
    hash: { type: String, default: '' },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ 'target.type': 1, 'target.id': 1 });
auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ scope: 1, tenantActor: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
