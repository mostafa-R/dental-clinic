import ApiError from '../utils/ApiError.js';
import { cacheTenant, getCachedTenant } from '../utils/cache.js';

// Platform apex domain. Allowed subdomains live underneath it; the bare apex
// (and any other host) is a platform route, never a tenant.
const APP_DOMAIN = (process.env.APP_DOMAIN || 'dentalos.app').toLowerCase();

/**
 * Tenant Router Middleware
 * 
 * يوجه الطلبات بناءً على subdomain (clinic-x.dentalos.app)
 * وفقاً لـ PRD القسم 5.2
 * 
 * Flow:
 * 1. استخراج subdomain من hostname
 * 2. البحث عن Tenant بناءً على slug
 * 3. إرفاق Tenant إلى request object
 * 4. تعيين tenant context لجميع middleware التالية
 * 
 * Cache Strategy:
 * - Tenant lookup يتم cache في Redis لمدة 5 دقائق
 * - Cache invalidation عند تحديث Tenant settings
 * 
 * NOTE: Only single-level subdomains are supported by design
 * (e.g. clinic-a.dentalos.app). Multi-level subdomains such as
 * dev.clinic-a.dentalos.app resolve to slug `dev` and will 404.
 */

export async function tenantRouter(req, res, next) {
  try {
    // Strip brackets/port-like artifacts so `::1` and `[::1]` are normalized.
    const hostname = req.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isBareIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === '::1';

    // تجاهل مسارات المنصة (app.dentalos.app, www.dentalos.app, dentalos.app)
    // plus local dev hosts and bare IPs (health checks, direct API access,
    // supertest) which never carry a tenant subdomain.
    if (
      hostname === 'localhost' || isBareIp ||
      hostname === APP_DOMAIN ||
      hostname === `app.${APP_DOMAIN}` ||
      hostname === `www.${APP_DOMAIN}`
    ) {
      req.isPlatformRoute = true;
      return next();
    }

    // استخراج subdomain
    const domainParts = hostname.split('.');
    if (domainParts.length < 2) {
      return next(ApiError.notFound('Invalid domain format'));
    }

    const subdomain = domainParts[0].toLowerCase();

    // تجاهل مسارات API العامة (api.dentalos.app)
    if (subdomain === 'api') {
      req.isApiRoute = true;
      return next();
    }

    // البحث في cache أولاً
    let tenant = await getCachedTenant(`slug:${subdomain}`);

    // إذا لم يوجد في cache، البحث في قاعدة البيانات. The lookup is NOT
    // pre-filtered on status/isActive: every tenant state must be reachable so
    // suspended/cancelled/archived clinics get their own precise message
    // instead of a generic 404 (and so expired trials are detected here).
    if (!tenant) {
      const { default: Tenant } = await import('../modules/site/tenant/tenant.model.js');
      const tenantDoc = await Tenant.findOne({ slug: subdomain });

      if (!tenantDoc) {
        // Tenant غير موجود
        return next(ApiError.notFound('Clinic not found'));
      }

      tenant = tenantDoc.toObject();

      // حفظ في cache لمدة 5 دقائق
      await cacheTenant(`slug:${subdomain}`, tenant, 300); // 5 دقائق
    }

    // التحقق من حالة الاشتراك — inactive/suspended/cancelled/archived clinics
    // get a precise message instead of a generic 404.
    if (tenant.isActive === false || ['suspended', 'cancelled', 'archived'].includes(tenant.status)) {
      const message =
        tenant.status === 'suspended'
          ? 'Clinic subscription is suspended. Please contact platform administrator.'
          : tenant.status === 'cancelled' || tenant.status === 'archived'
            ? 'Clinic subscription has been cancelled or archived.'
            : 'Clinic is inactive. Please contact platform administrator.';
      return next(ApiError.forbidden(message, { tenantId: tenant._id, status: tenant.status }));
    }

    // إنفاذ انتهاء الفترة التجريبية / الاشتراك عند الطلب (وليس فقط عبر
    // cron الليلي) — tenant منتهي الفترة التجريبية لا يعمل إلى الأبد.
    const nowMs = Date.now();
    const trialEndsAt = tenant.trialEndsAt ? new Date(tenant.trialEndsAt).getTime() : null;
    const subscriptionEndsAt = tenant.subscriptionEndsAt
      ? new Date(tenant.subscriptionEndsAt).getTime()
      : null;
    if (tenant.status === 'trial' && trialEndsAt !== null && nowMs > trialEndsAt) {
      return next(ApiError.forbidden(
        'Clinic trial has expired. Please contact the platform administrator to renew.',
        { tenantId: tenant._id, status: tenant.status, expiredAt: tenant.trialEndsAt },
      ));
    }
    if (tenant.status === 'active' && subscriptionEndsAt !== null && nowMs > subscriptionEndsAt) {
      return next(ApiError.forbidden(
        'Clinic subscription has expired. Please contact the platform administrator to renew.',
        { tenantId: tenant._id, status: tenant.status, expiredAt: tenant.subscriptionEndsAt },
      ));
    }

    // إرفاق Tenant إلى request
    req.tenant = tenant;
    req.tenantId = tenant._id;
    req.isClinicRoute = true;

    // تعيين tenant context لـ response locals
    res.locals.tenant = tenant;

    // إضافة tenant header للـ API requests
    res.set('X-Tenant-ID', tenant._id);
    res.set('X-Tenant-Name', tenant.name);

    console.log(`[TenantRouter] Tenant resolved: ${tenant.name} (${tenant.slug})`);

    next();
  } catch (error) {
    console.error('[TenantRouter] Error:', error);
    next(ApiError.internal('Failed to resolve tenant'));
  }
}

/**
 * Middleware للتحقق من حدود الباقة
 * يطبق حدود الاستخدام بناءً على خطة الاشتراك
 */
export function enforcePlanLimits(resourceType) {
  return async (req, res, next) => {
    try {
      if (!req.tenant) {
        // No subdomain-resolved tenant (platform routes, bare-IP / localhost
        // dev, supertest): nothing to enforce against. Skip rather than 401 so
        // mounted tenant-limit middleware never trips non-tenant traffic.
        return next();
      }

      const tenant = req.tenant;
      const limits = tenant.settings || {};

      // الحصول على العدد الحالي
      let currentCount = 0;
      let model;

      switch (resourceType) {
        case 'branches':
          model = (await import('../modules/users/branch.model.js')).default;
          currentCount = await model.countDocuments({ tenant: tenant._id, isActive: true });
          break;

        case 'doctors':
          model = (await import('../modules/users/user.model.js')).default;
          {
            // Count doctors the same way getTenantStats does: by role key, not
            // the legacy `isDoctor` bool. Users carry roleId, so resolve the
            // tenant's doctor/assistant roles first.
            const RoleModel = (await import('../modules/users/role.model.js')).default;
            const doctorRoleIds = await RoleModel.find({
              tenant: tenant._id,
              key: { $in: ['doctor', 'assistant'] },
            }).select('_id').lean();
            currentCount = await model.countDocuments({
              tenant: tenant._id,
              isActive: true,
              roleId: { $in: doctorRoleIds.map((r) => r._id) },
            });
          }
          break;

        case 'patients':
          model = (await import('../modules/patients/patient.model.js')).default;
          currentCount = await model.countDocuments({
            tenant: tenant._id,
            isActive: true
          });
          break;

        case 'storage':
          // حساب استخدام التخزين (بالـ MB). Sum `size` with an aggregation so
          // a large attachment table is read as a single number instead of
          // loading every document into memory.
          model = (await import('../modules/emr/attachment.model.js')).default;
          {
            const [storageAgg] = await model.aggregate([
              { $match: { tenant: tenant._id } },
              { $group: { _id: null, total: { $sum: '$size' } } },
            ]);
            currentCount = (storageAgg?.total || 0) / (1024 * 1024); // تحويل إلى MB
          }
          break;

        default:
          return next(ApiError.badRequest(`Unknown resource type: ${resourceType}`));
      }

      // The tenant model exposes the storage cap as `settings.storageLimit`
      // while everything else is `settings.max<Resource>`.
      const limitKey = resourceType === 'storage'
        ? 'storageLimit'
        : `max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`;
      const maxLimit = limits[limitKey];

      if (maxLimit !== undefined && maxLimit > 0 && currentCount >= maxLimit) {
        return next(ApiError.forbidden(
          `Plan limit reached. Maximum ${maxLimit} ${resourceType} allowed. Current: ${currentCount}`,
          {
            resourceType,
            currentCount,
            maxLimit,
            limitKey
          }
        ));
      }

      // إضافة معلومات الاستخدام إلى request للاستخدام اللاحق
      req.tenantUsage = req.tenantUsage || {};
      req.tenantUsage[resourceType] = { current: currentCount, limit: maxLimit };

      next();
    } catch (error) {
      console.error(`[PlanLimits] Error checking ${resourceType}:`, error);
      next(ApiError.internal(`Failed to check ${resourceType} limits`));
    }
  };
}

/**
 * Utility function لتحميل tenant من slug
 */
export async function loadTenantBySlug(slug) {
  try {
    const { default: Tenant } = await import('../modules/site/tenant/tenant.model.js');
    return await Tenant.findOne({ slug, isActive: true });
  } catch (error) {
    console.error('[loadTenantBySlug] Error:', error);
    throw error;
  }
}

/**
 * Cache invalidation lives in utils/cache.js — it clears both the
 * `tenant:{id}` config and the `tenant:slug:*` subdomain lookups so a
 * suspension/plan change is honored immediately. Re-exported here for
 * backward compatibility; there is intentionally ONE implementation.
 */
export { invalidateTenant, invalidateTenantRoles } from '../utils/cache.js';