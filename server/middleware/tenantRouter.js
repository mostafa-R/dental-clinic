import ApiError from '../utils/ApiError.js';
import { cacheDel, cacheTenant, getCachedTenant } from '../utils/cache.js';

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
 */

export async function tenantRouter(req, res, next) {
  try {
    const hostname = req.hostname;

    // تجاهل مسارات المنصة (app.dentalos.app, www.dentalos.app)
    // plus local dev hosts and bare IPs (health checks, direct API access,
    // supertest) which never carry a tenant subdomain.
    const isBareIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    if (hostname === 'app.dentalos.app' || hostname === 'www.dentalos.app' ||
      hostname === 'localhost' || hostname.includes('localhost:') || isBareIp) {
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

    // إذا لم يوجد في cache، البحث في قاعدة البيانات
    if (!tenant) {
      const { default: Tenant } = await import('../modules/site/tenant/tenant.model.js');
      const tenantDoc = await Tenant.findOne({
        slug: subdomain,
        isActive: true,
        status: { $in: ['active', 'trial'] }
      });

      if (!tenantDoc) {
        // Tenant غير موجود أو غير نشط
        return next(ApiError.notFound('Clinic not found or inactive'));
      }

      tenant = tenantDoc.toObject();

      // حفظ في cache لمدة 5 دقائق
      await cacheTenant(`slug:${subdomain}`, tenant, 300); // 5 دقائق
    }

    // التحقق من حالة الاشتراك
    if (tenant.status === 'suspended') {
      return next(ApiError.forbidden(
        'Clinic subscription is suspended. Please contact platform administrator.',
        { tenantId: tenant._id, status: tenant.status }
      ));
    }

    if (tenant.status === 'cancelled' || tenant.status === 'archived') {
      return next(ApiError.forbidden(
        'Clinic subscription has been cancelled or archived.',
        { tenantId: tenant._id, status: tenant.status }
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
        return next(ApiError.unauthorized('Tenant context required'));
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
          currentCount = await model.countDocuments({
            tenant: tenant._id,
            isActive: true,
            $or: [
              { 'role.key': 'doctor' },
              { 'role.key': 'assistant' }
            ]
          });
          break;

        case 'patients':
          model = (await import('../modules/patients/patient.model.js')).default;
          currentCount = await model.countDocuments({
            tenant: tenant._id,
            isActive: true
          });
          break;

        case 'storage':
          // حساب استخدام التخزين (بالـ MB)
          model = (await import('../modules/emr/attachment.model.js')).default;
          // projection passed as argument (no chained .select()) so the call
          // works with real Mongoose and promise-returning mocks alike
          const attachments = await model.find({ tenant: tenant._id }, 'size');
          currentCount = attachments.reduce((sum, att) => sum + (att.size || 0), 0) / (1024 * 1024); // تحويل إلى MB
          break;

        default:
          return next(ApiError.badRequest(`Unknown resource type: ${resourceType}`));
      }

      const limitKey = `max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}`;
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
 * Utility function لإبطال tenant cache
 */
export async function invalidateTenant(tenantId) {
  try {
    // إبطال cache الـ slug
    const { default: Tenant } = await import('../modules/site/tenant/tenant.model.js');
    const tenant = await Tenant.findById(tenantId);
    if (tenant && tenant.slug) {
      await cacheDel('tenant', `slug:${tenant.slug}`);
    }

    // إبطال cache الـ tenant نفسه
    await cacheDel('tenant', tenantId);

    console.log(`[TenantRouter] Cache invalidated for tenant: ${tenantId}`);
  } catch (error) {
    console.error('[invalidateTenant] Error:', error);
  }
}