import api from '../../lib/axios';

export const settingsApi = {
  getWhatsAppSettings: () => api.get('/whatsapp/settings').then((r) => r.data.data),
  updateWhatsAppSettings: (payload) => api.put('/whatsapp/settings', payload).then((r) => r.data.data),
  connectWhatsApp: () => api.post('/whatsapp/connect').then((r) => r.data),
  getWhatsAppQr: () => api.get('/whatsapp/qr').then((r) => r.data.data),
  getWhatsAppStatus: () => api.get('/whatsapp/status').then((r) => r.data.data),
  disconnectWhatsApp: () => api.post('/whatsapp/disconnect').then((r) => r.data),
  sendTestWhatsApp: (payload) => api.post('/whatsapp/test', payload).then((r) => r.data),
};