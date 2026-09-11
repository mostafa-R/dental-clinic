import siteApi from '../../lib/siteApi';

const unwrap = (r) => r.data.data;

export const platformApi = {
  // Analytics
  getGlobalStats: () => siteApi.get('/site/analytics/stats').then(unwrap),
  getGrowth: (period) => siteApi.get('/site/analytics/growth', { params: { period } }).then(unwrap),
  getTenantUsage: (tenantId) => siteApi.get(`/site/analytics/usage/${tenantId}`).then(unwrap),

  // Health
  getHealth: () => siteApi.get('/site/health').then(unwrap),

  // Tenants
  listTenants: (params) => siteApi.get('/site/tenants', { params }).then(unwrap),
  getTenant: (id) => siteApi.get(`/site/tenants/${id}`).then(unwrap),
  getTenantStats: (id) => siteApi.get(`/site/tenants/${id}/stats`).then(unwrap),
  createTenant: (payload) => siteApi.post('/site/tenants', payload).then(unwrap),
  updateTenant: (id, payload) => siteApi.put(`/site/tenants/${id}`, payload).then(unwrap),
  suspendTenant: (id) => siteApi.put(`/site/tenants/${id}/suspend`).then(unwrap),
  activateTenant: (id) => siteApi.put(`/site/tenants/${id}/activate`).then(unwrap),
  archiveTenant: (id) => siteApi.put(`/site/tenants/${id}/archive`).then(unwrap),
  deleteTenant: (id) => siteApi.delete(`/site/tenants/${id}`).then(unwrap),
  getUsersByTenant: (tenantId, params) => siteApi.get(`/site/users/by-tenant/${tenantId}`, { params }).then(unwrap),

  // Plans
  listPlans: () => siteApi.get('/site/plans').then(unwrap),
  createPlan: (payload) => siteApi.post('/site/plans', payload).then(unwrap),
  updatePlan: (id, payload) => siteApi.put(`/site/plans/${id}`, payload).then(unwrap),
  deletePlan: (id) => siteApi.delete(`/site/plans/${id}`).then(unwrap),

  // Subscriptions
  listSubscriptions: () => siteApi.get('/site/subscriptions').then(unwrap),
  getRevenueStats: () => siteApi.get('/site/subscriptions/revenue').then(unwrap),
  updateSubscription: (id, payload) => siteApi.put(`/site/subscriptions/${id}`, payload).then(unwrap),
  recordPayment: (tenantId, payload) => siteApi.post(`/site/subscriptions/${tenantId}/payment`, payload).then(unwrap),

  // Admins
  listAdmins: (params) => siteApi.get('/site/admins', { params }).then(unwrap),
  createAdmin: (payload) => siteApi.post('/site/admins', payload).then(unwrap),
  updateAdmin: (id, payload) => siteApi.put(`/site/admins/${id}`, payload).then(unwrap),
  updateAdminPermissions: (id, permissions) => siteApi.put(`/site/admins/${id}/permissions`, { permissions }).then(unwrap),
  deleteAdmin: (id) => siteApi.delete(`/site/admins/${id}`).then(unwrap),

  // Branches
  listBranches: (params) => siteApi.get('/site/branches', { params }).then(unwrap),
  createBranch: (payload) => siteApi.post('/site/branches', payload).then(unwrap),
  updateBranch: (id, payload) => siteApi.put(`/site/branches/${id}`, payload).then(unwrap),
  deleteBranch: (id) => siteApi.delete(`/site/branches/${id}`).then(unwrap),

  // Platform settings
  getPlatformSettings: () => siteApi.get('/site/platform').then(unwrap),
  updatePlatformSettings: (payload) => siteApi.put('/site/platform', payload).then(unwrap),

  // Audit
  listAuditLogs: (params) => siteApi.get('/site/audit-logs', { params }).then(unwrap),
  getAuditActions: () => siteApi.get('/site/audit-logs/actions').then(unwrap),

  // Feature flags
  getTenantModules: (tenantId) => siteApi.get(`/site/feature-flags/${tenantId}`).then(unwrap),
  toggleModule: (tenantId, payload) => siteApi.put(`/site/feature-flags/${tenantId}/toggle`, payload).then(unwrap),
  setModules: (tenantId, modules) => siteApi.put(`/site/feature-flags/${tenantId}/modules`, { modules }).then(unwrap),

  // Backups
  listBackups: (params) => siteApi.get('/site/backups', { params }).then(unwrap),
  triggerBackup: () => siteApi.post('/site/backups').then(unwrap),

  // Error logs
  listErrorLogs: (params) => siteApi.get('/site/error-logs', { params }).then(unwrap),
  getErrorLogStats: (params) => siteApi.get('/site/error-logs/stats', { params }).then(unwrap),
  resolveErrorLog: (id) => siteApi.patch(`/site/error-logs/${id}/resolve`).then(unwrap),

  // Quarantine
  getAbuseChecks: () => siteApi.get('/site/quarantine/checks').then(unwrap),
  setQuarantine: (tenantId, reason) => siteApi.put(`/site/quarantine/${tenantId}`, { reason }).then(unwrap),
  removeQuarantine: (tenantId) => siteApi.put(`/site/quarantine/${tenantId}/remove`).then(unwrap),

  // Impersonation
  impersonate: (payload) => siteApi.post('/site/impersonation/start', payload).then(unwrap),
  endImpersonation: () => siteApi.post('/site/impersonation/end').then(unwrap),
};

export const MODULE_LIST = [
  'dashboard', 'patients', 'appointments', 'billing',
  'accounting', 'emr', 'prescriptions', 'users',
  'branches', 'inventory', 'roles', 'settings',
  'chat', 'search',
];