import api from '../../lib/axios';

export const usersApi = {
  list: (params) => api.get('/users', { params }).then((r) => r.data.data),
  get: (id) => api.get(`/users/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/users', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/users/${id}`, payload).then((r) => r.data.data),
  delete: (id) => api.delete(`/users/${id}`).then((r) => r.data.data),
  toggleActive: (id) => api.patch(`/users/${id}/toggle-active`).then((r) => r.data.data),
  myPermissions: () => api.get('/auth/my-permissions').then((r) => r.data.data),
};
