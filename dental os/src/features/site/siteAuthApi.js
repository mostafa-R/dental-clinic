import siteApi from '../../lib/siteApi';

export const siteAuthApi = {
  login: (payload) => siteApi.post('/v1/site/auth/login', payload).then((r) => r.data.data),
  verify2faLogin: (payload) => siteApi.post('/v1/site/2fa/verify-login', payload).then((r) => r.data.data),
  refresh: () => siteApi.post('/v1/site/auth/refresh').then((r) => r.data.data),
  logout: () => siteApi.post('/v1/site/auth/logout').then((r) => r.data.data),
  getMe: () => siteApi.get('/v1/site/auth/me').then((r) => r.data.data),
  get2faStatus: () => siteApi.get('/v1/site/2fa/status').then((r) => r.data.data),
  setup2fa: () => siteApi.post('/v1/site/2fa/setup').then((r) => r.data.data),
  verify2faEnable: (token) => siteApi.post('/v1/site/2fa/verify', { token }).then((r) => r.data.data),
  disable2fa: (token) => siteApi.post('/v1/site/2fa/disable', { token }).then((r) => r.data.data),
};