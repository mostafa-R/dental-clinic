/**
 * Strict plan gate — no hardcoded defaults, no fallbacks.
 *
 * Every tenant must carry an explicit `planModules` array stamped from a
 * real `Plan` document in the database (see `Tenant.updatePlanSettings`).
 * There is no `starter` / `professional` / `enterprise` map anymore.
 *
 * - `tenant == null` returns true ONLY for platform/system-admin contexts.
 * - A tenant with an empty/missing `planModules` gets NO modules (deny).
 */
export function planIncludesModule(tenant, module) {
  if (!tenant) return true; // platform / no-tenant users get full access

  const modules = tenant.planModules;
  if (!Array.isArray(modules) || modules.length === 0) return false;

  return modules.includes(module);
}




