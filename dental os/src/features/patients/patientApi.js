import api from '../../lib/axios';

export const patientApi = {
  list: (params) => api.get('/patients', { params }).then((r) => r.data.data),
  get: (id) => api.get(`/patients/${id}`).then((r) => r.data.data),
  create: (payload) => api.post('/patients', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/patients/${id}`, payload).then((r) => r.data.data),
  archive: (id) => api.delete(`/patients/${id}`).then((r) => r.data.data),
};
