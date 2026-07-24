import api from '../../lib/axios';

export const authApi = {
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data.data),
  logout: () => api.post('/auth/logout').then((r) => r.data.data),
  refresh: () => api.post('/auth/refresh').then((r) => r.data.data),
  getMe: () => api.get('/auth/me').then((r) => r.data.data),
  verifyImpersonation: (token) => api.post('/auth/verify-impersonation', { token }).then((r) => r.data.data),
  createUser: (payload) => api.post('/users', payload).then((r) => r.data.data),
  listUsers: (params) => api.get('/users', { params }).then((r) => r.data.data),
};
