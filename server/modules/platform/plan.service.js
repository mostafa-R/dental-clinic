import Plan from './plan.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import Subscription from '../site/tenant/subscription.model.js';
import ApiError from '../../utils/ApiError.js';
import { cacheDel, invalidateTenant } from '../../utils/cache.js';
import { getPlanPrice } from '../site/subscription/subscription.service.js';
import { normalizePlanKey, parseStorageToMB } from './plan.utils.js';

export async function getPlans() {
  return Plan.find().sort({ price: 1 }).lean();
}

export async function getActivePlans() {
  return Plan.find({ isActive: true }).sort({ price: 1 }).lean();
}

export async function getPlan(id) {
  const plan = await Plan.findById(id).lean();
  if (!plan) throw ApiError.notFound('Plan not found');
  return plan;
}

export async function createPlan(data) {
  return Plan.create(data);
}

export async function updatePlan(id, data) {
  const plan = await Plan.findById(id);
  if (!plan) throw ApiError.notFound('Plan not found');

  // `key` is the stable join to Tenant.plan / Subscription.plan for legacy
  // rows with `planId: null`. Renaming it would orphan those tenants, so it
  // is immutable after creation (rename = create a new plan + reassign).
  if (data.key !== undefined && data.key !== plan.key) {
    throw ApiError.badRequest('Plan key is immutable. Create a new plan instead of renaming.', { key: 'immutable' });
  }
  if (data.planId !== undefined) {
    throw ApiError.badRequest('planId cannot be set directly.', { planId: 'immutable' });
  }

  // Field-preserving merge: never shallow-assign, or a partial `limits` patch
  // (e.g. only maxDoctors) would wipe the sibling limits (maxBranches/maxPatients/storage).
  const { limits, key: _ignoredKey, ...rest } = data;
  const oldKey = plan.key;
  Object.assign(plan, rest);
  plan._oldKey = oldKey;
  if (limits) {
    plan.limits = { ...(plan.limits || {}), ...limits };
  }

  await plan.save();

  if (data.modules || data.limits || data.price !== undefined) {
    const planObj = plan.toObject();
    const canonicalKey = planObj.key || normalizePlanKey(planObj.name || '');
    const settingsUpdate = {
      'settings.maxBranches': planObj.limits?.maxBranches,
      'settings.maxDoctors': planObj.limits?.maxDoctors,
      'settings.maxPatients': planObj.limits?.maxPatients,
      plan: canonicalKey,
      planId: planObj._id,
      planModules: planObj.modules ?? [],
    };
    // Plan stores storage as "5GB"/"500MB"/"1TB"; Tenant stores MB. The old
    // code never propagated storage at all, so editing a plan's storage left
    // every tenant on the old cap ("don't care what plans have").
    if (planObj.limits?.storage !== undefined || planObj.limits?.storageLimit !== undefined) {
      const raw = planObj.limits?.storageLimit ?? planObj.limits?.storage;
      const mb = parseStorageToMB(raw, undefined);
      if (mb !== undefined) settingsUpdate['settings.storageLimit'] = mb;
    }
    // Filter out undefined values
    const cleanUpdate = Object.fromEntries(
      Object.entries(settingsUpdate).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(cleanUpdate).length > 0) {
      // Match by planId AND by legacy plan key: tenants created before
      // planId was stamped (or via the old silent-fallback) carry only the
      // string key, and would otherwise never receive plan edits.
      // `oldKey` is kept in the filter so a historic direct-DB rename does
      // not orphan `planId: null` rows either.
      const oldKey = plan._oldKey;
      const keyOr = [{ plan: canonicalKey }];
      if (oldKey && oldKey !== canonicalKey) keyOr.push({ plan: oldKey });
      const tenantFilter = { $or: [{ planId: plan._id }, ...keyOr] };
      const tenantIds = await Tenant.find(tenantFilter).select('_id').lean();
      await Tenant.updateMany(tenantFilter, { $set: cleanUpdate });
      for (const t of tenantIds) {
        await invalidateTenant(String(t._id));
        await cacheDel('modules', String(t._id));
      }
    }

    // A price/interval change must flow into every active subscription on this
    // plan, otherwise billing keeps charging the stale amount.
    if (data.price !== undefined || data.interval) {
      const subs = await Subscription.find({ plan: canonicalKey })
        .select('billingCycle amount');
      for (const sub of subs) {
        sub.amount = await getPlanPrice(canonicalKey, sub.billingCycle);
        await sub.save();
      }
    }
  }

  return plan;
}

export async function deletePlan(id) {
  const plan = await Plan.findById(id);
  if (!plan) throw ApiError.notFound('Plan not found');
  const canonicalKey = plan.key || normalizePlanKey(plan.name || '');
  const assigned = await Tenant.countDocuments({
    $or: [{ planId: plan._id }, { plan: canonicalKey }],
  });
  if (assigned > 0) {
    throw ApiError.conflict(`${assigned} tenant(s) are still assigned to this plan. Reassign them first.`);
  }
  await plan.deleteOne();
}
