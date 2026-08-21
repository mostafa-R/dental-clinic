import mongoose from 'mongoose';

import { CRUD_ACTIONS, MODULE_KEYS } from '../../constants/permissions.js';

export { CRUD_ACTIONS, MODULE_KEYS };

/**
 * Permission entry: one per module, storing which CRUD actions are granted.
 * A missing module key means no access at all. A module with all four actions
 * false is equivalent to no access.
 */
const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      enum: MODULE_KEYS,
      required: true,
    },
    actions: {
      type: [String],
      enum: CRUD_ACTIONS,
      default: [],
    },
  },
  { _id: false },
);

const roleSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    /**
     * If true, this role bypasses all permission checks (platform/clinic owner).
     * Built-in clinic_admin roles are system-managed and always isSystemAdmin.
     */
    isSystemAdmin: {
      type: Boolean,
      default: false,
    },
    /**
     * If true, the role cannot be deleted or renamed (built-in roles).
     * Its permissions can still be edited by a clinic admin.
     */
    isBuiltIn: {
      type: Boolean,
      default: false,
    },
    /**
     * The role key used on the User document for backwards compatibility.
     * Built-in roles use the existing ROLES enum values (super_admin,
     * receptionist, etc.) so the system works even before a Role document
     * is explicitly created.
     */
    key: {
      type: String,
      trim: true,
      default: '',
    },
    permissions: {
      type: [permissionSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

/**
 * Compound unique index: one role per name per tenant per branch.
 * For platform-level roles (tenant: null), name must be globally unique.
 */
roleSchema.index(
  { tenant: 1, branch: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { tenant: { $type: 'objectId' } },
  },
);

roleSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { tenant: null },
  },
);

/**
 * Check if this role grants a specific action on a module.
 */
roleSchema.methods.hasPermission = function hasPermission(module, action) {
  if (this.isSystemAdmin) return true;
  const perm = (this.permissions || []).find((p) => p.module === module);
  if (!perm) return false;
  return perm.actions.includes(action);
};

/**
 * Get all permissions as a plain object keyed by module → actions array.
 */
roleSchema.methods.permissionMap = function permissionMap() {
  const map = {};
  for (const perm of this.permissions || []) {
    map[perm.module] = perm.actions || [];
  }
  return map;
};

roleSchema.set('toJSON', { virtuals: true });
roleSchema.set('toObject', { virtuals: true });

const Role = mongoose.model('Role', roleSchema);

export default Role;
