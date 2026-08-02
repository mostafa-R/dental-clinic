import Plan from './plan.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import Subscription from '../site/tenant/subscription.model.js';
import ApiError from '../../utils/ApiError.js';
import { cacheDel, invalidateTenant } from '../../utils/cache.js';
import { getPlanPrice } from '../site/subscription/subscription.service.js';

export async function getPlans() {
  return Plan.find().sort({ price: 1 }).lean();
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

  // Field-preserving merge: never shallow-assign, or a partial `limits` patch
  // (e.g. only maxDoctors) would wipe the sibling limits (maxBranches/maxPatients/storage).
  const { limits, ...rest } = data;
  Object.assign(plan, rest);
  if (limits) {
    plan.limits = { ...(plan.limits || {}), ...limits };
  }

  await plan.save();

  if (data.modules || data.limits || data.price !== undefined) {
    const planObj = plan.toObject();
    const settingsUpdate = {
      'settings.maxBranches': planObj.limits?.maxBranches,
      'settings.maxDoctors': planObj.limits?.maxDoctors,
      'settings.maxPatients': planObj.limits?.maxPatients,
      plan: planObj.key || planObj.name?.toLowerCase().replace(/\s+/g, "_"),
      planId: planObj._id,
      planModules: planObj.modules || [],
    };
    // Filter out undefined values
    const cleanUpdate = Object.fromEntries(
      Object.entries(settingsUpdate).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(cleanUpdate).length > 0) {
      // Collect affected tenants first so their cached configs can be dropped.
      const tenantIds = await Tenant.find({ planId: plan._id }).select('_id').lean();
      await Tenant.updateMany({ planId: plan._id }, { $set: cleanUpdate });
      for (const t of tenantIds) {
        await invalidateTenant(String(t._id));
        await cacheDel('modules', String(t._id));
      }
    }

    // A price/interval change must flow into every active subscription on this
    // plan, otherwise billing keeps charging the stale amount.
    if (data.price !== undefined || data.interval) {
      const subs = await Subscription.find({ plan: planObj.key || planObj.name?.toLowerCase().replace(/\s+/g, "_") })
        .select('billingCycle amount');
      for (const sub of subs) {
        sub.amount = await getPlanPrice(planObj.key || planObj.name?.toLowerCase().replace(/\s+/g, "_"), sub.billingCycle);
        await sub.save();
      }
    }
  }

  return plan;
}

export async function deletePlan(id) {
  const plan = await Plan.findById(id);
  if (!plan) throw ApiError.notFound('Plan not found');
  const assigned = await Tenant.countDocuments({ planId: plan._id });
  if (assigned > 0) {
    throw ApiError.conflict(`${assigned} tenant(s) are still assigned to this plan. Reassign them first.`);
  }
  await plan.deleteOne();
}
