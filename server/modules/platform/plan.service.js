import Plan from './plan.model.js';
import Tenant from '../site/tenant/tenant.model.js';
import ApiError from '../../utils/ApiError.js';

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
  Object.assign(plan, data);
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
      const result = await Tenant.updateMany({ planId: plan._id }, { $set: cleanUpdate });
      if (result.modifiedCount > 0) {
        console.log(`[Plan] Synced ${result.modifiedCount} tenant(s) to plan "${plan.key}"`);
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
