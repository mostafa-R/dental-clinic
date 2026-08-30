import siteApi from '../../lib/siteApi';

const unwrap = (r) => r.data.data;

export const platformApi = {
  // Analytics
  getGlobalStats: () => siteApi.get('/v1/site/analytics/stats').then(unwrap),
  getGrowth: (period) => siteApi.get('/v1/site/analytics/growth', { params: { period } }).then(unwrap),
  getTenantUsage: (tenantId) => siteApi.get(`/v1/site/analytics/usage/${tenantId}`).then(unwrap),

  // Health
  getHealth: () => siteApi.get('/v1/site/health').then(unwrap),

  // Tenants
  listTenants: (params) => siteApi.get('/v1/site/tenants', { params }).then(unwrap),
  getTenant: (id) => siteApi.get(`/v1/site/tenants/${id}`).then(unwrap),
  getTenantStats: (id) => siteApi.get(`/v1/site/tenants/${id}/stats`).then(unwrap),
  createTenant: (payload) => siteApi.post('/v1/site/tenants', payload).then(unwrap),
  updateTenant: (id, payload) => siteApi.put(`/v1/site/tenants/${id}`, payload).then(unwrap),
  suspendTenant: (id) => siteApi.put(`/v1/site/tenants/${id}/suspend`).then(unwrap),
  activateTenant: (id) => siteApi.put(`/v1/site/tenants/${id}/activate`).then(unwrap),
  archiveTenant: (id) => siteApi.put(`/v1/site/tenants/${id}/archive`).then(unwrap),
  deleteTenant: (id) => siteApi.delete(`/v1/site/tenants/${id}`).then(unwrap),
  getUsersByTenant: (tenantId, params) => siteApi.get(`/v1/site/users/by-tenant/${tenantId}`, { params }).then(unwrap),

  // Plans
  listPlans: () => siteApi.get('/v1/site/plans').then(unwrap),
  createPlan: (payload) => siteApi.post('/v1/site/plans', payload).then(unwrap),
  updatePlan: (id, payload) => siteApi.put(`/v1/site/plans/${id}`, payload).then(unwrap),
  deletePlan: (id) => siteApi.delete(`/v1/site/plans/${id}`).then(unwrap),

  // Subscriptions
  listSubscriptions: () => siteApi.get('/v1/site/subscriptions').then(unwrap),
  getRevenueStats: () => siteApi.get('/v1/site/subscriptions/revenue').then(unwrap),
  updateSubscription: (id, payload) => siteApi.put(`/v1/site/subscriptions/${id}`, payload).then(unwrap),
  recordPayment: (tenantId, payload) => siteApi.post(`/v1/site/subscriptions/${tenantId}/payment`, payload).then(unwrap),

  // Admins
  listAdmins: (params) => siteApi.get('/v1/site/admins', { params }).then(unwrap),
  createAdmin: (payload) => siteApi.post('/v1/site/admins', payload).then(unwrap),
  updateAdmin: (id, payload) => siteApi.put(`/v1/site/admins/${id}`, payload).then(unwrap),
  updateAdminPermissions: (id, permissions) => siteApi.put(`/v1/site/admins/${id}/permissions`, { permissions }).then(unwrap),
  deleteAdmin: (id) => siteApi.delete(`/v1/site/admins/${id}`).then(unwrap),

  // Branches
  listBranches: (params) => siteApi.get('/v1/site/branches', { params }).then(unwrap),
  createBranch: (payload) => siteApi.post('/v1/site/branches', payload).then(unwrap),
  updateBranch: (id, payload) => siteApi.put(`/v1/site/branches/${id}`, payload).then(unwrap),
  deleteBranch: (id) => siteApi.delete(`/v1/site/branches/${id}`).then(unwrap),

  // Platform settings
  getPlatformSettings: () => siteApi.get('/v1/site/platform').then(unwrap),
  updatePlatformSettings: (payload) => siteApi.put('/v1/site/platform', payload).then(unwrap),

  // Audit
  listAuditLogs: (params) => siteApi.get('/v1/site/audit-logs', { params }).then(unwrap),
  getAuditActions: () => siteApi.get('/v1/site/audit-logs/actions').then(unwrap),

  // Feature flags
  getTenantModules: (tenantId) => siteApi.get(`/v1/site/feature-flags/${tenantId}`).then(unwrap),
  toggleModule: (tenantId, payload) => siteApi.put(`/v1/site/feature-flags/${tenantId}/toggle`, payload).then(unwrap),
  setModules: (tenantId, modules) => siteApi.put(`/v1/site/feature-flags/${tenantId}/modules`, { modules }).then(unwrap),

  // Backups
  listBackups: (params) => siteApi.get('/v1/site/backups', { params }).then(unwrap),
  triggerBackup: () => siteApi.post('/v1/site/backups').then(unwrap),

  // Error logs
  listErrorLogs: (params) => siteApi.get('/v1/site/error-logs', { params }).then(unwrap),
  getErrorLogStats: (params) => siteApi.get('/v1/site/error-logs/stats', { params }).then(unwrap),
  resolveErrorLog: (id) => siteApi.patch(`/v1/site/error-logs/${id}/resolve`).then(unwrap),

  // Quarantine
  getAbuseChecks: () => siteApi.get('/v1/site/quarantine/checks').then(unwrap),
  setQuarantine: (tenantId, reason) => siteApi.put(`/v1/site/quarantine/${tenantId}`, { reason }).then(unwrap),
  removeQuarantine: (tenantId) => siteApi.put(`/v1/site/quarantine/${tenantId}/remove`).then(unwrap),

  // Impersonation
  impersonate: (payload) => siteApi.post('/v1/site/impersonation/start', payload).then(unwrap),
  endImpersonation: () => siteApi.post('/v1/site/impersonation/end').then(unwrap),
};

export const MODULE_LIST = [
  'dashboard', 'patients', 'appointments', 'billing',
  'accounting', 'emr', 'prescriptions', 'users',
  'branches', 'inventory', 'roles', 'settings',
  'chat', 'search',
];