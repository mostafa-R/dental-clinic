import api from '../../lib/axios';

// Every endpoint answers with the `sendSuccess` envelope, so each helper unwraps
// to `r.data.data`. Three of them used to return the whole envelope instead,
// which meant a caller reading `.status` off a disconnect silently got
// `undefined` unless it also knew to reach through `.data`.
export const settingsApi = {
  getWhatsAppSettings: () => api.get('/whatsapp/settings').then((r) => r.data.data),
  updateWhatsAppSettings: (payload) => api.put('/whatsapp/settings', payload).then((r) => r.data.data),
  connectWhatsApp: () => api.post('/whatsapp/connect').then((r) => r.data.data),
  getWhatsAppQr: () => api.get('/whatsapp/qr').then((r) => r.data.data),
  getWhatsAppStatus: () => api.get('/whatsapp/status').then((r) => r.data.data),
  disconnectWhatsApp: () => api.post('/whatsapp/disconnect').then((r) => r.data.data),
  sendTestWhatsApp: (payload) => api.post('/whatsapp/test', payload).then((r) => r.data.data),
};