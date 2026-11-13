import api from '../../lib/axios';

export const automationApi = {
  list: (params) => api.get('/automations', { params }).then((r) => r.data.data),
  get: (id) => api.get(`/automations/${id}`).then((r) => r.data.data),
  listTriggers: () => api.get('/automations/triggers').then((r) => r.data.data),
  create: (payload) => api.post('/automations', payload).then((r) => r.data.data),
  update: (id, payload) => api.patch(`/automations/${id}`, payload).then((r) => r.data.data),
  remove: (id) => api.delete(`/automations/${id}`).then((r) => r.data.data),
  installTemplates: (payload = {}) => api.post('/automations/install-templates', payload).then((r) => r.data.data),
  test: (id, payload = {}) => api.post(`/automations/${id}/test`, payload).then((r) => r.data.data),
  listRuns: (params) => api.get('/automations/runs', { params }).then((r) => r.data.data),
  getRun: (runId) => api.get(`/automations/runs/${runId}`).then((r) => r.data.data),
};
