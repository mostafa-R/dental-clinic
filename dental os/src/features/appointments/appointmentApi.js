import api from '../../lib/axios';

function cleanParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null && v !== undefined) out[k] = v;
  }
  return out;
}

export const appointmentApi = {
  list: (params) => api.get('/appointments', { params: cleanParams(params) }).then((r) => r.data.data),
  get: (id) => api.get(`/appointments/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/appointments', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/appointments/${id}`, payload).then((r) => r.data.data),
  transition: (id, status) => api.patch(`/appointments/${id}/status`, { status }).then((r) => r.data.data),
  cancel: (id) => api.delete(`/appointments/${id}`).then((r) => r.data.data),
  queue: () => api.get('/appointments/queue').then((r) => r.data.data.queue),
  callNext: (body = {}) => api.post('/appointments/queue/call-next', body).then((r) => r.data.data),
};
