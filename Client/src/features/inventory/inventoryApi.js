import api from '../../lib/axios';

export const inventoryApi = {
  list: (params) => api.get('/inventory', { params }).then((r) => r.data.data),
  get: (id) => api.get(`/inventory/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/inventory', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/inventory/${id}`, payload).then((r) => r.data.data),
  delete: (id) => api.delete(`/inventory/${id}`).then((r) => r.data.data),
  adjust: (id, payload) => api.post(`/inventory/${id}/adjust`, payload).then((r) => r.data.data),
};
