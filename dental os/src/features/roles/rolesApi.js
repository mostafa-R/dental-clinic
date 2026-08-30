import api from '../../lib/axios';

export const rolesApi = {
  list: () => api.get('/roles').then((r) => r.data.data),
  get: (id) => api.get(`/roles/${id}`).then((r) => r.data.data),
  listModules: () => api.get('/roles/modules/list').then((r) => r.data.data),
  create: (payload) => api.post('/roles', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/roles/${id}`, payload).then((r) => r.data.data),
  delete: (id) => api.delete(`/roles/${id}`).then((r) => r.data.data),
  matrix: () => api.get('/roles/matrix').then((r) => r.data.data),
  templates: () => api.get('/roles/templates').then((r) => r.data.data),
  createFromTemplate: (payload) => api.post('/roles/create-from-template', payload).then((r) => r.data.data),
  setPermissions: (id, permissions) => api.put(`/roles/${id}/permissions`, { permissions }).then((r) => r.data.data),
  toggleStatus: (id, isActive) => api.patch(`/roles/${id}/toggle-status`, { isActive }).then((r) => r.data.data),
};
