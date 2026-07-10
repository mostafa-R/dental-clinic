import ApiError from '../utils/ApiError.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { DEFAULT_PLAN_MODULES } from '../constants/plans.js';
import Tenant from '../models/Tenant.js';

/**
 * Middleware: verify that the authenticated user's tenant plan includes the
 * specified module. Uses Redis cache to avoid MongoDB queries on every request.
 *
 * Usage:
 *   router.get('/patients', requireFeature('patients'), patientController.list);
 */
export default function requireFeature(module) {
  return async function featureMiddleware(req, _res, next) {
    try {
      const tenant = req.user?.tenant;
      if (!tenant) return next();

      const tenantId = String(tenant._id || tenant);
      const cacheKey = `modules:${tenantId}`;

      let modules = await cacheGet(cacheKey);
      if (!modules) {
        const tenantDoc = await Tenant.findById(tenantId).select('planModules plan').lean();
        modules = tenantDoc?.planModules?.length
          ? tenantDoc.planModules
          : DEFAULT_PLAN_MODULES[tenantDoc?.plan] || DEFAULT_PLAN_MODULES.starter;
        await cacheSet(cacheKey, modules, 300);
      }

      if (!modules.includes(module)) {
        return next(ApiError.forbidden(`Your plan does not include the ${module} module. Contact your platform administrator to upgrade.`));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}
