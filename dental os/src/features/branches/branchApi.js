import api from '../../lib/axios';

export const branchApi = {
  list: (params) => api.get('/branches', { params }).then((r) => r.data.data),
  create: (payload) => api.post('/branches', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/branches/${id}`, payload).then((r) => r.data.data),
  delete: (id) => api.delete(`/branches/${id}`).then((r) => r.data.data),
};
