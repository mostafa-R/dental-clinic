import api from '../../lib/axios';

export const rolesApi = {
  list: () => api.get('/roles').then((r) => r.data.data),
  get: (id) => api.get(`/roles/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/roles', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/roles/${id}`, payload).then((r) => r.data.data),
  delete: (id) => api.delete(`/roles/${id}`).then((r) => r.data.data),
};
