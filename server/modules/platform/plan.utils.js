import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import Plan from './plan.model.js';

/**
 * Normalize a user-supplied plan key: trim, lowercase, spaces -> underscores.
 * Matches Plan.pre('save') key generation so "Pro Plus", "pro_plus", "PRO_PLUS"
 * all resolve to the same plan.
 */
export function normalizePlanKey(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Parse a Plan storage value ("5GB", "500MB", "1TB", 5120, ...) into MB.
 * Tenant.settings.storageLimit is stored in MB.
 * - "5GB" / "5 GB" -> 5120
 * - "500MB" -> 500
 * - "1TB" / "1.5TB" -> 1048576 / 1572864
 * - plain number string "5120" or number 5120 -> treated as MB (legacy)
 * Returns `fallback` when the value cannot be parsed.
 */
export function parseStorageToMB(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Legacy numeric storage on a Plan was historically interpreted as MB
    // by updatePlanSettings (passed straight through). Keep that contract:
    // a bare number means MB.
    return value;
  }
  const str = String(value).trim().toUpperCase().replace(/\s+/g, '');
  const match = str.match(/^([\d.]+)(GB|MB|TB|G|M|T)?$/);
  if (!match) return fallback;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return fallback;
  const unit = match[2] || 'MB';
  if (unit === 'TB' || unit === 'T') return Math.round(num * 1024 * 1024);
  if (unit === 'GB' || unit === 'G') return Math.round(num * 1024);
  return Math.round(num);
}

/**
 * Strict plan resolution — no legacy keys, no null fallbacks.
 * Every caller must supply a real, active `Plan` (key or ObjectId).
 * Missing / unknown / inactive references throw 400.
 */
export async function resolvePlanDoc(planRef) {
  if (!planRef) {
    throw ApiError.badRequest('Plan is required', { plan: 'required' });
  }
  const raw = String(planRef).trim();
  if (!raw) {
    throw ApiError.badRequest('Plan is required', { plan: 'required' });
  }

  // 1) ObjectId lookup (supports callers that send plan._id instead of plan.key)
  if (mongoose.isValidObjectId(raw)) {
    const byId = await Plan.findById(raw).lean();
    if (byId) {
      if (byId.isActive === false) {
        throw ApiError.badRequest(`Plan "${byId.name || raw}" is inactive`, { plan: 'inactive' });
      }
      return byId;
    }
    // Fall through to key lookup so a hex-looking key still has a chance.
  }

  // 2) Key lookup (normalized) — must be active to be assignable to new tenants.
  const key = normalizePlanKey(raw);
  const byKey = await Plan.findOne({ key, isActive: true }).lean();
  if (byKey) return byKey;

  // 3) Diagnose: exists but inactive vs. truly unknown, for a useful error.
  const anyPlan = await Plan.findOne({ key }).lean();
  if (anyPlan) {
    throw ApiError.badRequest(`Plan "${anyPlan.name || raw}" is inactive`, { plan: 'inactive' });
  }
  throw ApiError.badRequest(`Plan "${raw}" not found`, { plan: 'not found' });
}

/**
 * Canonical plan key for a resolved plan doc (key, or derived from name).
 */
export function planKeyOf(planDoc) {
  if (!planDoc) return null;
  return planDoc.key || normalizePlanKey(planDoc.name || '');
}
