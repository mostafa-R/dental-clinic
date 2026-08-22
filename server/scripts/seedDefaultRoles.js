/**
 * Seed Default Roles Script
 * 
 * ينشئ الأدوار الافتراضية عند إنشاء عيادة جديدة
 * أو يمكن تشغيله يدوياً لتهيئة الأدوار للعيادات الحالية
 */

import mongoose from 'mongoose';
import Role from '../modules/users/role.model.js';
import { DEFAULT_ROLES } from '../constants/roles.js';
import { connectDB, disconnectDB } from '../config/db.js';

/**
 * تهيئة الأدوار الافتراضية لعيادة معينة
 */
export async function seedDefaultRolesForTenant(tenantId) {
  console.log(`[SeedRoles] Seeding default roles for tenant: ${tenantId}`);
  
  try {
    const createdRoles = [];
    
    for (const [roleKey, roleDef] of Object.entries(DEFAULT_ROLES)) {
      // تخطي أدوار المنصة (platform_admin, super_admin) للعيادات
      if (roleKey === 'PLATFORM_ADMIN' || roleKey === 'SUPER_ADMIN') {
        continue;
      }
      
      // التحقق من عدم وجود الدور مسبقاً
      const existingRole = await Role.findOne({
        tenant: tenantId,
        key: roleDef.key
      });
      
      if (existingRole) {
        console.log(`[SeedRoles] Role ${roleDef.key} already exists for tenant ${tenantId}`);
        createdRoles.push(existingRole);
        continue;
      }
      
      // تحويل الصلاحيات إلى تنسيق قاعدة البيانات
      const permissions = Object.entries(roleDef.permissions).map(([module, actions]) => ({
        module,
        actions
      }));
      
      // إنشاء الدور
      const role = await Role.create({
        tenant: tenantId,
        branch: null, // أدوار على مستوى العيادة (جميع الفروع)
        name: roleDef.name,
        key: roleDef.key,
        description: roleDef.description,
        isSystemAdmin: roleDef.isSystemAdmin || false,
        isBuiltIn: roleDef.isBuiltIn || false,
        permissions: permissions,
        isActive: true
      });
      
      console.log(`[SeedRoles] Created role: ${roleDef.name} (${roleDef.key})`);
      createdRoles.push(role);
    }
    
    console.log(`[SeedRoles] Successfully seeded ${createdRoles.length} default roles for tenant ${tenantId}`);
    return createdRoles;
    
  } catch (error) {
    console.error(`[SeedRoles] Error seeding roles for tenant ${tenantId}:`, error);
    throw error;
  }
}

/**
 * تهيئة أدوار المنصة (platform-level roles)
 */
export async function seedPlatformRoles() {
  console.log('[SeedRoles] Seeding platform roles...');
  
  try {
    const platformRoles = [];
    
    for (const [roleKey, roleDef] of Object.entries(DEFAULT_ROLES)) {
      // فقط أدوار المنصة
      if (roleKey !== 'PLATFORM_ADMIN' && roleKey !== 'SUPER_ADMIN') {
        continue;
      }
      
      // التحقق من عدم وجود الدور مسبقاً (tenant: null يعني منصة)
      const existingRole = await Role.findOne({
        tenant: null,
        key: roleDef.key
      });
      
      if (existingRole) {
        console.log(`[SeedRoles] Platform role ${roleDef.key} already exists`);
        platformRoles.push(existingRole);
        continue;
      }
      
      // تحويل الصلاحيات إلى تنسيق قاعدة البيانات
      const permissions = Object.entries(roleDef.permissions).map(([module, actions]) => ({
        module,
        actions
      }));
      
      // إنشاء دور المنصة
      const role = await Role.create({
        tenant: null,
        branch: null,
        name: roleDef.name,
        key: roleDef.key,
        description: roleDef.description,
        isSystemAdmin: roleDef.isSystemAdmin || false,
        isBuiltIn: roleDef.isBuiltIn || false,
        permissions: permissions,
        isActive: true
      });
      
      console.log(`[SeedRoles] Created platform role: ${roleDef.name} (${roleDef.key})`);
      platformRoles.push(role);
    }
    
    console.log(`[SeedRoles] Successfully seeded ${platformRoles.length} platform roles`);
    return platformRoles;
    
  } catch (error) {
    console.error('[SeedRoles] Error seeding platform roles:', error);
    throw error;
  }
}

/**
 * تشغيل السكريبت من سطر الأوامر
 */
async function main() {
  try {
    await connectDB();
    
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('Usage:');
      console.log('  node seedDefaultRoles.js --tenant <tenantId>  # Seed roles for specific tenant');
      console.log('  node seedDefaultRoles.js --platform           # Seed platform roles');
      console.log('  node seedDefaultRoles.js --all-tenants        # Seed roles for all tenants');
      return;
    }
    
    if (args.includes('--platform')) {
      await seedPlatformRoles();
    }
    
    if (args.includes('--all-tenants')) {
      const { default: Tenant } = await import('../modules/site/tenant/tenant.model.js');
      const tenants = await Tenant.find({ isActive: true });
      
      console.log(`[SeedRoles] Found ${tenants.length} active tenants`);
      
      for (const tenant of tenants) {
        await seedDefaultRolesForTenant(tenant._id);
      }
      
      console.log(`[SeedRoles] Completed seeding roles for all ${tenants.length} tenants`);
    }
    
    const tenantIndex = args.indexOf('--tenant');
    if (tenantIndex !== -1 && args[tenantIndex + 1]) {
      const tenantId = args[tenantIndex + 1];
      
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        console.error(`[SeedRoles] Invalid tenant ID: ${tenantId}`);
        return;
      }
      
      await seedDefaultRolesForTenant(tenantId);
    }
    
    console.log('[SeedRoles] Script completed successfully');
    
  } catch (error) {
    console.error('[SeedRoles] Script failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// تشغيل السكريبت إذا تم استدعاؤه مباشرة
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}