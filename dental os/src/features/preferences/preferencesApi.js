import api from '../../lib/axios';

export const preferencesApi = {
  update: (payload) => api.patch('/auth/preferences', payload).then((r) => r.data.data),
};
