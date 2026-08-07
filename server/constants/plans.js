/**
 * Maps each subscription plan to the set of system modules it unlocks.
 *
 * These act as the **default** plan definitions and are also used as fallback
 * when the `Plan` model has not yet been seeded.  At runtime the system
 * prefers the `planModules` array stamped on the Tenant document, which is
 * populated from the `Plan` model when the tenant is created/updated.
 *
 * - starter:   core clinic operations (patients, appointments, billing)
 * - professional: + EMR, prescriptions, accounting, staff management
 * - enterprise:  everything (inventory, roles, settings, branches)
 */
const DEFAULT_PLAN_MODULES = {
  starter: [
    'dashboard',
    'patients',
    'appointments',
    'billing',
  ],
  professional: [
    'dashboard',
    'patients',
    'appointments',
    'billing',
    'accounting',
    'emr',
    'prescriptions',
    'users',
    'branches',
    'chat',
  ],
  enterprise: [
    'dashboard',
    'patients',
    'appointments',
    'billing',
    'accounting',
    'emr',
    'prescriptions',
    'users',
    'branches',
    'inventory',
    'roles',
    'settings',
    'chat',
  ],
};

/**
 * Check if a plan includes a module.
 *
 * The `tenant` argument should be the sub-document object attached to the
 * authenticated user (or a plain object with a `planModules` array).  When
 * `tenant` is `null` or falsy (platform-level users) every module passes.
 *
 * When `tenant.planModules` is empty we fall back to the hardcoded map so
 * that legacy tenants keep working without a re-seed.
 */
export function planIncludesModule(tenant, module) {
  if (!tenant) return true; // platform / no-tenant users get full access

  const modules = tenant.planModules?.length
    ? tenant.planModules
    : DEFAULT_PLAN_MODULES[tenant.plan] || DEFAULT_PLAN_MODULES.starter;

  return modules.includes(module);
}




