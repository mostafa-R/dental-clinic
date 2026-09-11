import siteApi from '../../lib/siteApi';

export const siteAuthApi = {
  login: (payload) => siteApi.post('/site/auth/login', payload).then((r) => r.data.data),
  verify2faLogin: (payload) => siteApi.post('/site/2fa/verify-login', payload).then((r) => r.data.data),
  refresh: () => siteApi.post('/site/auth/refresh').then((r) => r.data.data),
  logout: () => siteApi.post('/site/auth/logout').then((r) => r.data.data),
  getMe: () => siteApi.get('/site/auth/me').then((r) => r.data.data),
  get2faStatus: () => siteApi.get('/site/2fa/status').then((r) => r.data.data),
  setup2fa: () => siteApi.post('/site/2fa/setup').then((r) => r.data.data),
  verify2faEnable: (token) => siteApi.post('/site/2fa/verify', { token }).then((r) => r.data.data),
  disable2fa: (token) => siteApi.post('/site/2fa/disable', { token }).then((r) => r.data.data),
};