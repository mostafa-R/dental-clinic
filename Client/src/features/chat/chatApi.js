import api from '../../lib/axios';

export const chatApi = {
  listMessages: (params) => api.get('/chat', { params }).then((r) => r.data.data),
  sendMessage: (payload) => api.post('/chat', payload).then((r) => r.data.data),
  markRead: (messageIds) => api.patch('/chat/read', { messageIds }).then((r) => r.data.data),
  markChannelRead: (channel) => api.post('/chat/channel-read', { channel }).then((r) => r.data.data),
  listStaff: () => api.get('/chat/staff').then((r) => r.data.data),
  getUnreadCounts: () => api.get('/chat/unread').then((r) => r.data.data),
};