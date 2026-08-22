/**
 * Default Roles Configuration
 * 
 * الأدوار الافتراضية الثمانية حسب PRD القسم 4.2
 * هذه الأدوار تُنشئ تلقائياً عند إنشاء عيادة جديدة
 * ولا يمكن حذفها (isBuiltIn: true)
 * 
 * المصفوفة الكاملة حسب PRD 4.3:
 * كل دور له صلاحيات محددة على كل موديول
 */

import { MODULE_KEYS } from './permissions.js';

/**
 * الأدوار الافتراضية مع تعريفاتها
 */
export const DEFAULT_ROLES = {
  RECEPTIONIST: {
    key: 'receptionist',
    name: 'موظف استقبال',
    description: 'إدارة الواجهة والحجوزات والتحصيل',
    isBuiltIn: true,
    isSystemAdmin: false,
    permissions: {
      dashboard: ['read'],
      patients: ['create', 'read', 'update', 'delete'],
      appointments: ['create', 'read', 'update', 'delete'],
      billing: ['create', 'read'],
      queue: ['create', 'read', 'update'],
      installments: ['create', 'read'],
      chat: ['create', 'read'],
      whatsapp: ['read'], // للقراءة فقط للإشعارات
    }
  },

  DOCTOR: {
    key: 'doctor',
    name: 'طبيب',
    description: 'العلاج والتوثيق الطبي',
    isBuiltIn: true,
    isSystemAdmin: false,
    permissions: {
      dashboard: ['read'],
      patients: ['read', 'update'],
      appointments: ['read', 'update'],
      emr: ['create', 'read', 'update'],
      treatment_plans: ['create', 'read', 'update'],
      dental_chart: ['create', 'read', 'update'],
      clinical_notes: ['create', 'read', 'update'],
      prescriptions: ['create', 'read', 'update'],
      queue: ['read', 'update'],
      chat: ['create', 'read'],
    }
  },

  ASSISTANT: {
    key: 'assistant',
    name: 'مساعد طبيب',
    description: 'مساعدة الطبيب في العلاج والتوثيق',
    isBuiltIn: true,
    isSystemAdmin: false,
    permissions: {
      dashboard: ['read'],
      patients: ['read'],
      appointments: ['read'],
      emr: ['create', 'read', 'update'],
      treatment_plans: ['read'],
      dental_chart: ['read', 'update'],
      clinical_notes: ['create', 'read'],
      prescriptions: ['read'],
      queue: ['read'],
      chat: ['create', 'read'],
    }
  },

  ACCOUNTANT: {
    key: 'accountant',
    name: 'محاسب',
    description: 'الرقابة المالية والمحاسبة',
    isBuiltIn: true,
    isSystemAdmin: false,
    permissions: {
      dashboard: ['read'],
      patients: ['read'], // قراءة مقيدة للبيانات المالية فقط
      billing: ['create', 'read', 'update', 'delete'],
      accounting: ['create', 'read', 'update', 'delete'],
      installments: ['create', 'read', 'update', 'delete'],
      chat: ['create', 'read'],
    }
  },

  INVENTORY_MANAGER: {
    key: 'inventory_manager',
    name: 'أمين مخزن',
    description: 'إدارة المواد والمشتريات',
    isBuiltIn: true,
    isSystemAdmin: false,
    permissions: {
      dashboard: ['read'],
      inventory: ['create', 'read', 'update', 'delete'],
      chat: ['create', 'read'],
    }
  },

  CLINIC_MANAGER: {
    key: 'clinic_manager',
    name: 'مدير المركز',
    description: 'إدارة المركز بالكامل',
    isBuiltIn: true,
    isSystemAdmin: true, // يرى كل شيء داخل مستأجره
    permissions: {
      dashboard: ['create', 'read', 'update', 'delete'],
      patients: ['create', 'read', 'update', 'delete'],
      appointments: ['create', 'read', 'update', 'delete'],
      billing: ['create', 'read', 'update', 'delete'],
      accounting: ['create', 'read', 'update', 'delete'],
      inventory: ['create', 'read', 'update', 'delete'],
      emr: ['create', 'read', 'update', 'delete'],
      treatment_plans: ['create', 'read', 'update', 'delete'],
      dental_chart: ['create', 'read', 'update', 'delete'],
      clinical_notes: ['create', 'read', 'update', 'delete'],
      prescriptions: ['create', 'read', 'update', 'delete'],
      queue: ['create', 'read', 'update', 'delete'],
      installments: ['create', 'read', 'update', 'delete'],
      whatsapp: ['create', 'read', 'update', 'delete'],
      users: ['create', 'read', 'update', 'delete'],
      branches: ['create', 'read', 'update', 'delete'],
      settings: ['create', 'read', 'update', 'delete'],
      roles: ['create', 'read', 'update', 'delete'],
      chat: ['create', 'read', 'update', 'delete'],
    }
  },

  PLATFORM_ADMIN: {
    key: 'platform_admin',
    name: 'مدير المنصة',
    description: 'تشغيل منصة SaaS',
    isBuiltIn: true,
    isSystemAdmin: true,
    permissions: {
      platform_settings: ['create', 'read', 'update', 'delete'],
      // هذا دور على مستوى المنصة، ليس له صلاحيات على بيانات العيادات
    }
  },

  SUPER_ADMIN: {
    key: 'super_admin',
    name: 'مدير عام',
    description: 'صلاحيات كاملة على النظام بالكامل',
    isBuiltIn: true,
    isSystemAdmin: true,
    permissions: {
      // جميع الصلاحيات على جميع الموديولات
      ...Object.fromEntries(MODULE_KEYS.map(key => [key, ['create', 'read', 'update', 'delete']]))
    }
  }
};

/**
 * مصفوفة الصلاحيات الكاملة حسب PRD 4.3
 * مفيدة للعرض في الواجهة والتحقق
 */
export const PERMISSION_MATRIX = {
  // يمكن تنفيذها لاحقاً للعرض في واجهة إدارة الصلاحيات
};

/**
 * التحقق من أن دوراً معيناً له صلاحية معينة
 */
export function roleHasPermission(roleKey, module, action) {
  const role = DEFAULT_ROLES[roleKey.toUpperCase()];
  if (!role) return false;
  
  if (role.isSystemAdmin) return true;
  
  const modulePermissions = role.permissions[module];
  return modulePermissions && modulePermissions.includes(action);
}

/**
 * الحصول على قائمة الأدوار الافتراضية
 */
export function getDefaultRoles() {
  return Object.values(DEFAULT_ROLES).map(role => ({
    key: role.key,
    name: role.name,
    description: role.description,
    isBuiltIn: role.isBuiltIn,
    isSystemAdmin: role.isSystemAdmin
  }));
}

/**
 * تحويل صلاحيات الدور إلى تنسيق قاعدة البيانات
 */
export function getRolePermissions(roleKey) {
  const role = DEFAULT_ROLES[roleKey.toUpperCase()];
  if (!role) return [];
  
  return Object.entries(role.permissions).map(([module, actions]) => ({
    module,
    actions
  }));
}