import api from '../../lib/axios';

export const recallApi = {
  list: (params) => api.get('/recalls', { params }).then((r) => r.data.data),
  get: (id) => api.get(`/recalls/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/recalls', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/recalls/${id}`, payload).then((r) => r.data.data),
  contact: (id, payload) => api.post(`/recalls/${id}/contact`, payload || {}).then((r) => r.data.data),
  postpone: (id, payload) => api.post(`/recalls/${id}/postpone`, payload).then((r) => r.data.data),
  schedule: (id, payload) => api.post(`/recalls/${id}/schedule`, payload).then((r) => r.data.data),
  complete: (id, payload) => api.post(`/recalls/${id}/complete`, payload || {}).then((r) => r.data.data),
  dismiss: (id, payload) => api.post(`/recalls/${id}/dismiss`, payload || {}).then((r) => r.data.data),
};
