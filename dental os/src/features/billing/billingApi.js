import api from '../../lib/axios';

function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null && v !== undefined) out[k] = v;
  }
  return out;
}

export const billingApi = {
  list: (params) => api.get('/billing', { params: cleanParams(params) }).then((r) => r.data.data),
  summary: () => api.get('/billing/summary').then((r) => r.data.data),
  get: (id) => api.get(`/billing/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/billing', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/billing/${id}`, payload).then((r) => r.data.data),
  addPayment: (id, payload) => api.post(`/billing/${id}/payments`, payload).then((r) => r.data.data),
  void: (id) => api.post(`/billing/${id}/void`).then((r) => r.data.data),
  aging: () => api.get('/billing/aging').then((r) => r.data.data),
  refund: (id, payload) => api.post(`/billing/${id}/refund`, payload).then((r) => r.data.data),
};
