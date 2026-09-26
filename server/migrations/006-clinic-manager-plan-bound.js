import mongoose from 'mongoose';

import { invalidateRole } from '../utils/cache.js';

/**
 * Migration: 006-clinic-manager-plan-bound
 *
 * The built-in `clinic_manager` role shipped with `isSystemAdmin: true`, which
 * is a blanket bypass rather than a permission grant. `checkPermission` checks
 * that flag *before* it consults the tenant's plan:
 *
 *   if (isSystemAdmin) return next();
 *   if (!planIncludesModule(req.user.tenant, module)) throw ...;
 *
 * So a clinic manager could open every page and every feature of the product
 * even when the clinic had not paid for the matching `planModules` entry — the
 * plan only ever applied to non-admin roles.
 *
 * This makes the manager's effective access the intersection of the two things
 * that are supposed to bound it:
 *
 *   1. the permissions actually granted to the `clinic_manager` role, which
 *      the manager can now edit (see role.enhanced.controller.js), and
 *   2. the modules present in `tenant.planModules`.
 *
 * Only the tenant-scoped `clinic_manager` role is touched. Platform roles
 * (platform_admin / super_admin, tenant === null) keep `isSystemAdmin: true` —
 * they are the ones that are supposed to bypass the plan.
 *
 * `permissions` is deliberately left untouched: this migration only removes
 * the bypass, it does not reset what each clinic had already granted.
 *
 * Cached roles are evicted afterwards, otherwise a Redis-cached
 * `isSystemAdmin: true` would keep granting the old access until the TTL.
 */

const CLINIC_MANAGER_KEY = 'clinic_manager';

export async function up() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'roles' }).toArray();
  if (collections.length === 0) {
    console.log('[Migration] No roles collection — nothing to migrate');
    return;
  }

  const roles = db.collection('roles');

  // Only rows that actually carry the bypass need a write, so a database that
  // is already migrated (or seeded fresh from the updated constant) is a no-op.
  const toFix = await roles
    .find({ key: CLINIC_MANAGER_KEY, isSystemAdmin: true })
    .project({ _id: 1, tenant: 1 })
    .toArray();

  if (toFix.length === 0) {
    console.log('[Migration] No clinic_manager role with isSystemAdmin — already up to date');
    return;
  }

  const result = await roles.updateMany(
    { key: CLINIC_MANAGER_KEY, isSystemAdmin: true },
    { $set: { isSystemAdmin: false } },
  );

  console.log(
    `[Migration] Set isSystemAdmin=false on ${result.modifiedCount} clinic_manager role(s); ` +
      'they are now bounded by tenant.planModules',
  );

  // Evict the cached copies so the change takes effect immediately instead of
  // after the cache TTL. Best-effort: a missing Redis must not fail the
  // migration, since the DB write above is the source of truth.
  for (const role of toFix) {
    try {
      await invalidateRole(String(role._id));
    } catch (error) {
      console.error(
        `[Migration] Could not invalidate role cache for ${role._id} (${role.tenant ?? 'platform'}): ${error.message}`,
      );
    }
  }
  console.log(`[Migration] Invalidated ${toFix.length} cached clinic_manager role(s)`);

  // Report clinics whose plan would now hide modules from their manager. This is
  // expected under a strict plan, but it is worth seeing in the migration log
  // rather than discovering it as a support ticket.
  const tenants = await db
    .collection('tenants')
    .find({ _id: { $in: toFix.map((r) => r.tenant).filter(Boolean) } })
    .project({ _id: 1, name: 1, planModules: 1, plan: 1 })
    .toArray();

  const empty = tenants.filter((t) => !Array.isArray(t.planModules) || t.planModules.length === 0);
  if (empty.length > 0) {
    console.warn(
      `[Migration] WARNING: ${empty.length} clinic/clinics have an empty or missing planModules — ` +
        'their manager now has NO module access at all. Backfill planModules before going live.',
    );
    for (const tenant of empty) {
      console.warn(`[Migration]   - ${tenant.name || tenant._id} (${tenant._id})`);
    }
  }
}

export async function down() {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({ name: 'roles' }).toArray();
  if (collections.length === 0) return;

  const roles = db.collection('roles');

  // Restore the bypass for tenant-scoped clinic_manager roles only. Platform
  // roles were never modified by `up` and must stay untouched.
  const result = await roles.updateMany(
    { key: CLINIC_MANAGER_KEY, isSystemAdmin: false, tenant: { $ne: null } },
    { $set: { isSystemAdmin: true } },
  );
  console.log(`[Migration] Restored isSystemAdmin=true on ${result.modifiedCount} clinic_manager role(s)`);

  const affected = await roles
    .find({ key: CLINIC_MANAGER_KEY, tenant: { $ne: null } })
    .project({ _id: 1 })
    .toArray();
  for (const role of affected) {
    try {
      await invalidateRole(String(role._id));
    } catch (error) {
      console.error(`[Migration] Could not invalidate role cache for ${role._id}: ${error.message}`);
    }
  }
}
